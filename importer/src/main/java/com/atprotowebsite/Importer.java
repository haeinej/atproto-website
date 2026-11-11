package com.atprotowebsite;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class Importer {
    private static final String USAGE = """
            Usage: java -jar x-archive-importer.jar --archive PATH [--id X_POST_ID ...]
                   [--site HTTPS_ORIGIN] [--publish --pds HTTPS_ORIGIN --handle HANDLE --did DID]
                   [--label NAME ...] [--also-bluesky]
            Preview is offline. Publishing reads ATPROTO_APP_PASSWORD or prompts for an app password.
            Site defaults to the handle's HTTPS origin, or https://example.com for preview.
            """;
    private static final ObjectMapper JSON = new ObjectMapper();

    public static void main(String[] args) {
        if (args.length == 0 || Arrays.asList(args).contains("--help")) {
            System.out.print(USAGE);
            return;
        }
        try {
            run(args);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            System.err.println("Import interrupted. Rerun the same selection to resume.");
            System.exit(130);
        } catch (IOException | IllegalArgumentException problem) {
            System.err.println("Import stopped: " + problem.getMessage());
            System.exit(1);
        }
    }

    private static void run(String[] args) throws IOException, InterruptedException {
        var options = new HashMap<String, String>();
        var selected = new LinkedHashSet<String>();
        var labels = new LinkedHashSet<String>();
        boolean publish = false;
        boolean alsoBluesky = false;
        for (int i = 0; i < args.length; i++) {
            String option = args[i];
            if (option.equals("--publish")) {
                publish = true;
                continue;
            }
            if (option.equals("--also-bluesky")) {
                alsoBluesky = true;
                continue;
            }
            if (!Set.of("--archive", "--id", "--pds", "--handle", "--did", "--site", "--label").contains(option)
                    || i + 1 >= args.length || args[i + 1].startsWith("--")) {
                throw new IllegalArgumentException("Unknown option or missing value: " + option);
            }
            String value = args[++i];
            if (option.equals("--id")) {
                if (!value.matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("Invalid X post ID");
                selected.add(value);
            } else if (option.equals("--label")) {
                String label = value.strip();
                if (label.isEmpty()) throw new IllegalArgumentException("--label needs a nonempty name");
                labels.add(label);
            } else if (options.putIfAbsent(option, value) != null) {
                throw new IllegalArgumentException("Repeated option: " + option);
            }
        }
        var selection = Archive.read(Path.of(require(options, "--archive")), selected);
        var tags = List.copyOf(labels);
        URI site = origin(options.getOrDefault("--site", "https://" + options.getOrDefault("--handle", "example.com")), false);
        if (alsoBluesky) {
            var keys = new HashMap<String, String>();
            for (Post post : selection.posts()) {
                if (!post.fitsBluesky()) continue;
                String prior = keys.putIfAbsent(post.blueskyRecordKey(), post.id());
                if (prior != null) throw new IOException("Bluesky record key collision between X posts " + prior + " and " + post.id());
            }
        }
        if (!publish) {
            printPreview(selection, site, tags);
            return;
        }

        if ((!selected.isEmpty() && !selection.skipped().isEmpty()) || selection.posts().isEmpty()) {
            printPreview(selection, site, tags);
            throw new IOException("No complete selection to publish");
        }
        String did = require(options, "--did");
        String handle = require(options, "--handle");
        if (!did.matches("did:(?:plc:[a-z2-7]{24}|web:[a-zA-Z0-9.-]+)")) throw new IllegalArgumentException("Invalid account DID");
        if (!handle.matches("[a-zA-Z0-9.-]+\\.[a-zA-Z0-9-]+")) throw new IllegalArgumentException("Use the domain handle without @");
        URI pds = origin(require(options, "--pds"), true);
        int created = 0;
        int present = 0;
        int blueskyCreated = 0;
        int blueskySkipped = 0;
        try (var client = new PdsClient(pds, handle, did, appPassword())) {
            for (Post post : selection.posts()) {
                String key = post.recordKey();
                String postUri = "at://" + did + "/" + Post.COLLECTION + "/" + key;
                boolean added = client.createIfAbsent(Post.COLLECTION, key, post.archiveRecord(site, tags), post.media());
                if (added) created++;
                else present++;
                System.out.printf("%s %s  %s%n", added ? "Imported" : "Already present", post.id(), postUri);
                if (alsoBluesky) {
                    if (!post.fitsBluesky()) {
                        blueskySkipped++;
                        System.out.println("Bluesky copy skipped for " + post.id() + " due to its text or media");
                    } else if (client.createIfAbsent(Post.BLUESKY_COLLECTION, post.blueskyRecordKey(), post.blueskyPost(), List.of())) {
                        blueskyCreated++;
                    }
                }
            }
        }
        System.out.printf("%d posts imported, %d already present, %d skipped in archive%n",
                created, present, selection.skipped().size());
        if (alsoBluesky) System.out.printf("%d Bluesky copies created, %d incompatible with Bluesky export%n",
                blueskyCreated, blueskySkipped);
    }

    private static void printPreview(Archive.Selection selection, URI site, List<String> tags) throws IOException {
        var preview = JSON.createObjectNode();
        var candidates = preview.putArray("candidates");
        for (Post post : selection.posts()) {
            var entry = candidates.addObject().put("recordKey", post.recordKey())
                    .put("fitsBluesky", post.fitsBluesky());
            entry.set("record", post.archiveRecord(site, tags));
        }
        var skipped = preview.putObject("skipped");
        selection.skipped().forEach(skipped::put);
        System.out.println(JSON.writerWithDefaultPrettyPrinter().writeValueAsString(preview));
    }

    private static String require(Map<String, String> options, String name) {
        String value = options.get(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing " + name);
        return value;
    }

    private static URI origin(String value, boolean allowLoopback) {
        URI uri = URI.create(value);
        String host = uri.getHost();
        boolean loopback = "localhost".equals(host) || "127.0.0.1".equals(host);
        if (host == null || !("https".equals(uri.getScheme()) || (allowLoopback && loopback && "http".equals(uri.getScheme())))
                || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !Set.of("", "/").contains(uri.getRawPath())) {
            throw new IllegalArgumentException(allowLoopback
                    ? "Use the PDS HTTPS origin, or a loopback HTTP origin for local tests"
                    : "Use the website's HTTPS origin for --site");
        }
        return uri;
    }

    private static String appPassword() {
        String fromEnv = System.getenv("ATPROTO_APP_PASSWORD");
        if (fromEnv != null && !fromEnv.isBlank()) return fromEnv;
        var console = System.console();
        if (console != null) {
            char[] password = console.readPassword("Cirrus app password: ");
            if (password != null) {
                try {
                    if (password.length > 0) return new String(password);
                } finally {
                    Arrays.fill(password, '\0');
                }
            }
        }
        throw new IllegalArgumentException("Provide a Cirrus app password at the prompt or via ATPROTO_APP_PASSWORD");
    }
}
