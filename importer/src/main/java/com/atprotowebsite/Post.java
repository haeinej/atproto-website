package com.atprotowebsite;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

record Post(String id, Instant createdAt, String text, String body, List<Post.Media> media) {
    static final String COLLECTION = "com.haeinjung.post";
    static final String BLUESKY_COLLECTION = "app.bsky.feed.post";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final long X_EPOCH = 1_288_834_974_657L;
    private static final long TID_SLOTS_PER_MILLISECOND = 1_000 * 1_024L;
    private static final String TID_ALPHABET = "234567abcdefghijklmnopqrstuvwxyz";
    private static final Pattern LINKS = Pattern.compile("https?://[^\\s<>]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern GRAPHEME = Pattern.compile("\\X");

    String recordKey() {
        return "x-" + id;
    }

    String blueskyRecordKey() {
        long snowflakeTime = X_EPOCH + (Long.parseUnsignedLong(id) >>> 22);
        long originalTime = createdAt.toEpochMilli();
        long millis = Math.abs(snowflakeTime - originalTime) < 1_000 ? snowflakeTime : originalTime;
        long slot = Math.floorMod(ByteBuffer.wrap(sha256(("x:" + id).getBytes(StandardCharsets.UTF_8))).getLong(),
                TID_SLOTS_PER_MILLISECOND);
        // A TID has 53 timestamp bits (microseconds) and 10 clock bits.
        long tid = Math.addExact(Math.multiplyExact(millis, TID_SLOTS_PER_MILLISECOND), slot);
        if (tid < 0) throw new IllegalArgumentException("date outside TID range");
        char[] key = new char[13];
        for (int i = key.length - 1; i >= 0; i--) {
            key[i] = TID_ALPHABET.charAt((int) (tid & 31));
            tid >>>= 5;
        }
        return new String(key);
    }

    ObjectNode archiveRecord(URI site, List<String> tags) {
        String publishedAt = createdAt.toString();
        var record = JSON.createObjectNode().put("$type", COLLECTION).put("body", body)
                .put("publishedAt", publishedAt).put("canonicalUrl", site.resolve("/posts/" + recordKey()).toString());
        record.putObject("source").put("platform", "x").put("id", id)
                .put("uri", "https://x.com/i/web/status/" + id).put("publishedAt", publishedAt);
        if (!tags.isEmpty()) {
            var labels = record.putArray("tags");
            tags.forEach(labels::add);
        }
        if (!media.isEmpty()) {
            var attachments = record.putArray("media");
            for (Media attachment : media) attachments.add(attachment.archiveEntry());
        }
        return record;
    }

    boolean fitsBluesky() {
        return text.getBytes(StandardCharsets.UTF_8).length <= 3_000
                && GRAPHEME.matcher(text).results().limit(301).count() <= 300
                && media.size() <= 4
                && media.stream().allMatch(attachment -> attachment.kind().equals("image") && attachment.size() <= 2_000_000);
    }

    ObjectNode blueskyPost() {
        ObjectNode record = JSON.createObjectNode()
                .put("$type", BLUESKY_COLLECTION).put("text", text).put("createdAt", createdAt.toString());
        var facets = JSON.createArrayNode();
        var links = LINKS.matcher(text);
        while (links.find()) {
            String url = links.group().replaceFirst("[.,!?;:)]+$", "");
            if (!isWebLink(url)) continue;
            var facet = facets.addObject();
            facet.putObject("index")
                    .put("byteStart", text.substring(0, links.start()).getBytes(StandardCharsets.UTF_8).length)
                    .put("byteEnd", text.substring(0, links.start() + url.length()).getBytes(StandardCharsets.UTF_8).length);
            facet.putArray("features").addObject().put("$type", "app.bsky.richtext.facet#link").put("uri", url);
        }
        if (!facets.isEmpty()) record.set("facets", facets);
        if (!media.isEmpty()) {
            var images = record.putObject("embed").put("$type", "app.bsky.embed.images").putArray("images");
            for (Media attachment : media) {
                images.addObject().put("alt", attachment.alt()).set("image", attachment.blob());
            }
        }
        return record;
    }

    static boolean isWebLink(String value) {
        try {
            URI uri = URI.create(value);
            return uri.getHost() != null && uri.getRawUserInfo() == null
                    && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()));
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }

    record Media(String id, String kind, Path path, String sourceUrl, String alt, int width, int height,
                 int durationMs, String cid, String mimeType, int size) {
        private static final int MAX_BYTES = 60_000_000;

        static Media inspect(String id, String kind, Path path, String sourceUrl, String alt,
                             int width, int height, int durationMs) {
            try {
                byte[] bytes = read(path);
                String mimeType = mimeType(bytes);
                if (!mimeType.startsWith(kind + "/")) throw new IOException("media type does not match " + kind);
                return new Media(id, kind, path, sourceUrl, alt, width, height, durationMs,
                        cidFor(bytes), mimeType, bytes.length);
            } catch (IOException problem) {
                throw new IllegalArgumentException(path.getFileName() + ": " + problem.getMessage(), problem);
            }
        }

        byte[] verifiedBytes() throws IOException {
            byte[] bytes = read(path);
            if (!cid.equals(cidFor(bytes))) throw new IOException("Archive media changed: " + path.getFileName());
            return bytes;
        }

        ObjectNode archiveEntry() {
            var entry = JSON.createObjectNode().put("$type", COLLECTION + "#" + kind)
                    .put("id", id).put("sourceUrl", sourceUrl);
            entry.set("original", blob());
            if (kind.equals("image")) {
                if (!alt.isBlank()) entry.put("alt", alt);
                if (width > 0 && height > 0) entry.put("width", width).put("height", height);
            }
            if (kind.equals("video") && durationMs >= 0) entry.put("durationMs", durationMs);
            return entry;
        }

        ObjectNode blob() {
            ObjectNode blob = JSON.createObjectNode().put("$type", "blob").put("mimeType", mimeType).put("size", size);
            blob.putObject("ref").put("$link", cid);
            return blob;
        }

        private static byte[] read(Path path) throws IOException {
            if (!Files.isRegularFile(path, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                throw new IOException("media file is missing");
            }
            try (var input = Files.newInputStream(path)) {
                byte[] bytes = input.readNBytes(MAX_BYTES + 1);
                if (bytes.length > MAX_BYTES) throw new IOException("media file exceeds 60 MB");
                return bytes;
            }
        }

        private static String mimeType(byte[] bytes) throws IOException {
            if (bytes.length >= 3 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xd8 && bytes[2] == (byte) 0xff) {
                return "image/jpeg";
            }
            if (Arrays.equals(Arrays.copyOf(bytes, 8), new byte[]{(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10})) {
                return "image/png";
            }
            if (bytes.length >= 12 && new String(bytes, 0, 4, StandardCharsets.US_ASCII).equals("RIFF")
                    && new String(bytes, 8, 4, StandardCharsets.US_ASCII).equals("WEBP")) {
                return "image/webp";
            }
            if (bytes.length >= 12 && new String(bytes, 4, 4, StandardCharsets.US_ASCII).equals("ftyp")) {
                return "video/mp4";
            }
            throw new IOException("expected JPEG, PNG, WebP, or MP4 media");
        }

        private static String cidFor(byte[] bytes) {
            byte[] cid = new byte[36];
            // CIDv1, raw codec, SHA-256 multihash with a 32-byte digest.
            cid[0] = 1;
            cid[1] = 0x55;
            cid[2] = 0x12;
            cid[3] = 0x20;
            System.arraycopy(sha256(bytes), 0, cid, 4, 32);
            String alphabet = "abcdefghijklmnopqrstuvwxyz234567";
            var encoded = new StringBuilder("b");
            int buffer = 0;
            int bits = 0;
            for (byte value : cid) {
                buffer = (buffer << 8) | Byte.toUnsignedInt(value);
                bits += 8;
                while (bits >= 5) {
                    bits -= 5;
                    encoded.append(alphabet.charAt((buffer >>> bits) & 31));
                }
            }
            if (bits > 0) encoded.append(alphabet.charAt((buffer << (5 - bits)) & 31));
            return encoded.toString();
        }
    }

    private static byte[] sha256(byte[] bytes) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(bytes);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
