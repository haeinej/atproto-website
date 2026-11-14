package com.atprotowebsite;

import static org.junit.jupiter.api.Assertions.assertEquals;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

final class PostTest {
    // URL fixtures match feed/pds.mjs on Node 24.22.2, ICU 78.3, Unicode 17.0.
    private final Post post = new Post("123", Instant.parse("2022-01-01T00:00:00Z"),
            "Synthetic archive post.", "Synthetic archive post.", List.of());
    private static final URI SITE = URI.create("https://example.com");

    @Test void unnamedPostsHaveAnOtherFolder() {
        var record = post.archiveRecord(SITE, Post.COLLECTION, "");
        assertEquals("other", record.path("label").asText());
        assertEquals("https://example.com/posts/other/x-123", record.path("canonicalUrl").asText());
        assertEquals("123", record.path("source").path("id").asText());
        assertEquals("x-123", post.recordKey());
    }

    @Test void authorLabelDeterminesTheFolderWithoutChangingItsNameOrRecordKey() {
        var record = post.archiveRecord(SITE, Post.COLLECTION, "Things I Make");
        assertEquals("Things I Make", record.path("label").asText());
        assertEquals("https://example.com/posts/things-i-make/x-123", record.path("canonicalUrl").asText());
        assertEquals("x-123", post.recordKey());
    }

    @Test void multilingualFoldersFollowTheSharedSitePathEncoding() {
        var record = post.archiveRecord(SITE, Post.COLLECTION, "서울 Café");
        assertEquals("서울 Café", record.path("label").asText());
        assertEquals("https://example.com/posts/%EC%84%9C%EC%9A%B8-caf%C3%A9/x-123",
                record.path("canonicalUrl").asText());
    }

    @Test void filingUsesTheSharedTrimAndLengthBoundary() {
        var record = post.archiveRecord(SITE, Post.COLLECTION, "\u00a0\ufeffWritings\u00a0");
        assertEquals("Writings", record.path("label").asText());
        assertEquals("https://example.com/posts/writings/x-123", record.path("canonicalUrl").asText());
        assertEquals(100, post.archiveRecord(SITE, Post.COLLECTION, "a".repeat(101)).path("label").asText().length());
    }

    @Test void greekCaseIgnorableMarkUsesTheSharedFinalSigmaFolder() {
        String label = "ΑΣͅ";
        var record = post.archiveRecord(SITE, Post.COLLECTION, label);
        assertEquals(label, record.path("label").asText());
        assertEquals("https://example.com/posts/%CE%B1%CF%82%CD%85/x-123",
                record.path("canonicalUrl").asText());
        assertEquals("x-123", post.recordKey());
    }

    @Test void unicode151LetterKeepsItsFolder() {
        String label = "𮯰";
        var record = post.archiveRecord(SITE, Post.COLLECTION, label);
        assertEquals(label, record.path("label").asText());
        assertEquals("https://example.com/posts/%F0%AE%AF%B0/x-123", record.path("canonicalUrl").asText());
    }

    @Test void unicode17LetterUsesTheSharedLowercaseAndFolder() {
        String label = "𖺠";
        var record = post.archiveRecord(SITE, Post.COLLECTION, label);
        assertEquals(label, record.path("label").asText());
        assertEquals("https://example.com/posts/%F0%96%BA%BB/x-123", record.path("canonicalUrl").asText());
    }

    @Test void folderUsesNfcWithoutRewritingTheAuthorsLabel() {
        String label = "Cafe\u0301";
        var record = post.archiveRecord(SITE, Post.COLLECTION, label);
        assertEquals(label, record.path("label").asText());
        assertEquals("https://example.com/posts/caf%C3%A9/x-123", record.path("canonicalUrl").asText());
    }

    @Test void separatorRunsCollapseWithoutAddingAnEmptyFolder() {
        var record = post.archiveRecord(SITE, Post.COLLECTION, " — Things / I?! Make — ");
        assertEquals("— Things / I?! Make —", record.path("label").asText());
        assertEquals("https://example.com/posts/things-i-make/x-123", record.path("canonicalUrl").asText());
        assertEquals("https://example.com/posts/x-123",
                post.archiveRecord(SITE, Post.COLLECTION, "!!!").path("canonicalUrl").asText());
    }
}
