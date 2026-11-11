package com.atprotowebsite;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

final class PdsClient implements AutoCloseable {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final URI origin;
    private final String handle;
    private final String did;
    private final String password;
    private String token;

    PdsClient(URI origin, String handle, String did, String password) {
        this.origin = origin;
        this.handle = handle;
        this.did = did;
        this.password = password;
    }

    boolean createIfAbsent(String collection, String key, ObjectNode record, List<Post.Media> media)
            throws IOException, InterruptedException {
        String uri = "at://" + did + "/" + collection + "/" + key;
        if (existingMatches(collection, key, uri, record)) return false;

        for (Post.Media attachment : media) {
            var uploaded = authenticated("com.atproto.repo.uploadBlob", attachment.verifiedBytes(), attachment.mimeType());
            uploaded.requireSuccess("uploading " + attachment.path().getFileName());
            if (!attachment.blob().equals(uploaded.body().path("blob"))) {
                throw new IOException("PDS returned unexpected blob metadata for " + attachment.path().getFileName());
            }
        }
        var body = JSON.createObjectNode().put("repo", did).put("collection", collection).put("rkey", key);
        body.set("record", record);
        var created = authenticated("com.atproto.repo.createRecord", JSON.writeValueAsBytes(body), "application/json");
        if (!created.success() && created.status() != 429 && existingMatches(collection, key, uri, record)) {
            return false;
        }
        created.requireSuccess("creating " + uri);
        if (!created.body().path("uri").asText().equals(uri)) throw new IOException("PDS returned an unexpected record URI");
        return true;
    }

    private boolean existingMatches(String collection, String key, String uri, JsonNode expected)
            throws IOException, InterruptedException {
        var result = request("com.atproto.repo.getRecord?repo=" + encode(did) + "&collection=" + collection
                + "&rkey=" + key, null, null, null);
        if ((result.status() == 400 || result.status() == 404) && result.error().equals("RecordNotFound")) return false;
        result.requireSuccess("reading " + uri);
        if (!uri.equals(result.body().path("uri").asText()) || !expected.equals(result.body().path("value"))) {
            throw new IOException("Existing record differs at " + uri + ". Review the conflict before retrying.");
        }
        return true;
    }

    private Result authenticated(String method, byte[] body, String mimeType) throws IOException, InterruptedException {
        if (token == null) login();
        Result response = request(method, body, mimeType, token);
        if (response.status() == 401 && (response.error().equals("ExpiredToken") || response.error().equals("InvalidToken"))) {
            login();
            response = request(method, body, mimeType, token);
        }
        return response;
    }

    private void login() throws IOException, InterruptedException {
        var credentials = JSON.createObjectNode().put("identifier", handle).put("password", password);
        var response = request("com.atproto.server.createSession", JSON.writeValueAsBytes(credentials), "application/json", null);
        response.requireSuccess("signing in to " + origin);
        String accessToken = response.body().path("accessJwt").asText();
        if (!did.equals(response.body().path("did").asText()) || accessToken.isBlank()) {
            throw new IOException("PDS session did not match the requested DID");
        }
        token = accessToken;
    }

    private Result request(String method, byte[] body, String mimeType, String bearer) throws IOException, InterruptedException {
        var builder = HttpRequest.newBuilder(origin.resolve("/xrpc/" + method))
                .timeout(Duration.ofSeconds(30)).header("Accept", "application/json");
        if (body != null) builder.header("Content-Type", mimeType).POST(HttpRequest.BodyPublishers.ofByteArray(body));
        if (bearer != null) builder.header("Authorization", "Bearer " + bearer);
        var response = http.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
        JsonNode data;
        try {
            data = JSON.readTree(response.body());
        } catch (IOException invalid) {
            data = null;
        }
        return new Result(response.statusCode(), data == null ? JSON.createObjectNode() : data);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    @Override public void close() {
        http.close();
    }

    private record Result(int status, JsonNode body) {
        boolean success() { return status >= 200 && status < 300; }
        String error() {
            String value = body.path("error").asText();
            return value.matches("[A-Za-z0-9]+") ? value : "";
        }
        void requireSuccess(String operation) throws IOException {
            if (!success()) throw new IOException(operation + " failed (HTTP " + status
                    + (error().isEmpty() ? "" : ", " + error()) + ")");
        }
    }
}
