package com.atprotowebsite;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.PushbackReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;

final class Archive {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern PART = Pattern.compile("tweets(?:-part[0-9]+)?\\.js");
    private static final Pattern WRAPPER = Pattern.compile("\\s*\\uFEFF?\\s*window\\.YTD\\.tweets\\.part[0-9]+\\s*=\\s*");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("EEE MMM dd HH:mm:ss xx uuuu", Locale.ENGLISH);
    private static final Pattern STATUS_LINK = Pattern.compile("https?://(?:www\\.)?(?:x|twitter)\\.com/[^/]+/status/\\d+.*", Pattern.CASE_INSENSITIVE);
    private static final Pattern SHORT_LINK = Pattern.compile("https://t\\.co/[A-Za-z0-9]+");
    private static final Pattern MEDIA_FILENAME = Pattern.compile("[a-zA-Z0-9_-]+\\.[a-zA-Z0-9]+");

    record Selection(List<Post> posts, Map<String, String> skipped) {}

    static Selection read(Path extracted, Set<String> selected) throws IOException {
        Path data = Files.isDirectory(extracted.resolve("data")) ? extracted.resolve("data") : extracted;
        List<Path> parts;
        try (var files = Files.list(data)) {
            parts = files.filter(path -> PART.matcher(path.getFileName().toString()).matches())
                    .filter(Files::isRegularFile).sorted().toList();
        }
        if (parts.isEmpty()) throw new IOException("No tweets.js or tweets-partN.js files in " + data);

        var posts = new LinkedHashMap<String, Post>();
        var skipped = new TreeMap<String, String>();
        var ids = new LinkedHashMap<String, JsonNode>();
        for (Path part : parts) {
            for (JsonNode entry : readPart(part)) {
                JsonNode tweet = entry.path("tweet");
                String id = tweet.path("id_str").asText(tweet.path("id").asText(""));
                if (!selected.isEmpty() && !selected.contains(id)) continue;
                if (!id.matches("[1-9][0-9]{0,18}")) throw new IOException("Invalid X post ID in " + part.getFileName());
                JsonNode prior = ids.putIfAbsent(id, tweet);
                if (prior != null) {
                    if (!prior.equals(tweet)) throw new IOException("Conflicting archive entries for X post " + id);
                    continue;
                }
                try {
                    posts.put(id, parsePost(id, tweet, data));
                } catch (IllegalArgumentException | DateTimeParseException problem) {
                    skipped.put(id, problem.getMessage());
                }
            }
        }
        for (String id : selected) {
            if (!ids.containsKey(id)) skipped.put(id, "not found in the archive");
        }
        var sorted = posts.values().stream().sorted(Comparator.comparing(Post::createdAt).thenComparing(Post::id)).toList();
        return new Selection(sorted, skipped);
    }

    private static JsonNode readPart(Path part) throws IOException {
        try (var reader = new PushbackReader(Files.newBufferedReader(part), 1)) {
            var prefix = new StringBuilder();
            int next;
            while ((next = reader.read()) != '[' && next != -1 && prefix.length() < 256) prefix.append((char) next);
            if (next != '[' || !WRAPPER.matcher(prefix).matches()) {
                throw new IOException("Unexpected X export format in " + part.getFileName());
            }
            reader.unread(next);
            try (var parser = JSON.getFactory().createParser(reader)) {
                JsonNode values = JSON.readTree(parser);
                if (!values.isArray()) throw new IOException("Expected an array of posts in " + part.getFileName());
                // X wraps JSON in an assignment, with an optional terminal semicolon.
                var tail = new java.io.StringWriter();
                parser.releaseBuffered(tail);
                reader.transferTo(tail);
                if (!tail.toString().strip().matches(";?")) {
                    throw new IOException("Unexpected trailing data in " + part.getFileName());
                }
                return values;
            }
        }
    }

    private static Post parsePost(String id, JsonNode tweet, Path data) {
        String text = tweet.path("full_text").asText(tweet.path("text").asText(""));
        JsonNode entities = tweet.path("entities");
        if (tweet.hasNonNull("in_reply_to_status_id_str") || tweet.hasNonNull("in_reply_to_status_id")) {
            throw new IllegalArgumentException("reply");
        }
        if (tweet.hasNonNull("retweeted_status") || text.startsWith("RT @")) {
            throw new IllegalArgumentException("repost");
        }
        if (tweet.hasNonNull("quoted_status_id_str") || tweet.hasNonNull("quoted_status")
                || tweet.path("is_quote_status").asBoolean()) throw new IllegalArgumentException("quote post");
        Instant createdAt = ZonedDateTime.parse(tweet.path("created_at").asText(), DATE).toInstant();

        var media = new ArrayList<Post.Media>();
        var placements = new HashMap<String, List<Post.Media>>();
        Path mediaDirectory = data.resolve("tweets_media");
        JsonNode attachments = tweet.path("extended_entities").path("media");
        if (!attachments.isArray() || attachments.isEmpty()) attachments = entities.path("media");
        for (JsonNode item : attachments) {
            var attachment = parseMedia(id, "media-" + (media.size() + 1), item, mediaDirectory);
            media.add(attachment);
            String shortUrl = item.path("url").asText();
            if (SHORT_LINK.matcher(shortUrl).matches()) {
                placements.computeIfAbsent(shortUrl, key -> new ArrayList<>()).add(attachment);
            }
        }

        var expandedLinks = new HashMap<String, String>();
        for (JsonNode link : entities.path("urls")) {
            String shortUrl = link.path("url").asText();
            String expanded = link.path("expanded_url").asText();
            if (STATUS_LINK.matcher(expanded).matches()) throw new IllegalArgumentException("linked X post");
            if (SHORT_LINK.matcher(shortUrl).matches() && Post.isWebLink(expanded)) expandedLinks.put(shortUrl, expanded);
        }
        var plain = new StringBuilder();
        var markdown = new StringBuilder();
        var placed = new HashSet<String>();
        var links = SHORT_LINK.matcher(text);
        int offset = 0;
        while (links.find()) {
            appendText(text.substring(offset, links.start()), plain, markdown);
            String link = links.group();
            if (placements.containsKey(link)) {
                if (placed.add(link)) {
                    for (Post.Media attachment : placements.get(link)) {
                        String alt = markdownText(attachment.alt().replaceAll("\\s+", " "));
                        markdown.append("\n\n![").append(alt).append("](media:").append(attachment.id()).append(")\n\n");
                    }
                }
            } else {
                String expanded = expandedLinks.getOrDefault(link, link);
                plain.append(expanded);
                markdown.append('<').append(URI.create(expanded).toASCIIString()).append('>');
            }
            offset = links.end();
        }
        appendText(text.substring(offset), plain, markdown);
        String body = markdown.toString().replaceAll("\\n(?:[ \\t]*\\n){2,}", "\n\n").strip();
        if (body.isBlank() && media.isEmpty()) throw new IllegalArgumentException("empty post");
        if (body.getBytes(StandardCharsets.UTF_8).length > 262_144) {
            throw new IllegalArgumentException("body exceeds the post Lexicon limit of 256 KiB");
        }
        return new Post(id, createdAt, plain.toString().strip(), body, List.copyOf(media));
    }

    private static void appendText(String raw, StringBuilder plain, StringBuilder markdown) {
        String text = raw.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
        plain.append(text);
        markdown.append(markdownText(text));
    }

    private static String markdownText(String text) {
        return text.replace("\\", "\\\\").replace("`", "\\`").replace("*", "\\*").replace("_", "\\_")
                .replace("[", "\\[").replace("]", "\\]").replace("<", "\\<").replace(">", "\\>")
                .replace("&", "\\&")
                .replaceAll("(?m)^( {0,3})([#=+~\\-])", "$1\\\\$2")
                .replaceAll("(?m)^( {0,3}\\d{1,9})([.)])(?=\\s)", "$1\\\\$2");
    }

    private static Post.Media parseMedia(String postId, String attachmentId, JsonNode item, Path directory) {
        String type = item.path("type").asText();
        String source = item.path("media_url_https").asText(item.path("media_url").asText());
        String alt = item.path("ext_alt_text").asText("");
        if (type.equals("photo")) {
            Path file = mediaPath(directory, postId, source);
            if (file == null) throw new IllegalArgumentException("invalid photo URL or filename");
            var dimensions = item.path("original_info");
            return Post.Media.inspect(attachmentId, "image", file, source, alt,
                    dimensions.path("width").asInt(0), dimensions.path("height").asInt(0), -1);
        }
        if (!type.equals("video") && !type.equals("animated_gif")) {
            throw new IllegalArgumentException("unsupported X attachment type: " + type);
        }

        var info = item.path("video_info");
        Path file = localMp4(directory, postId, source);
        long bitrate = -1;
        for (JsonNode variant : info.path("variants")) {
            String url = variant.path("url").asText();
            if (!variant.path("content_type").asText().equals("video/mp4")) continue;
            Path candidate = localMp4(directory, postId, url);
            long candidateBitrate = variant.path("bitrate").asLong(0);
            if (candidate != null && candidateBitrate > bitrate) {
                file = candidate;
                source = url;
                bitrate = candidateBitrate;
            }
        }
        if (file == null) throw new IllegalArgumentException("MP4 attachment missing from the X archive");
        return Post.Media.inspect(attachmentId, "video", file, source, alt, 0, 0,
                info.path("duration_millis").asInt(-1));
    }

    private static Path localMp4(Path directory, String postId, String source) {
        Path path = mediaPath(directory, postId, source);
        return path != null && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".mp4")
                && Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) ? path : null;
    }

    private static Path mediaPath(Path directory, String postId, String source) {
        if (!Post.isWebLink(source)) return null;
        String path = URI.create(source).getPath();
        String name = path.substring(path.lastIndexOf('/') + 1);
        return MEDIA_FILENAME.matcher(name).matches() ? directory.resolve(postId + "-" + name) : null;
    }
}
