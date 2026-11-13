-- The vault service's storage. One row for each post a member has. A post's ID is given once, when
-- it is made, and is what the row is known by; its slug, label and everything else can change. A
-- removed post keeps its row with no version, so a client asking "what changed since" is told
-- that it went.
CREATE TABLE IF NOT EXISTS posts (
  did TEXT NOT NULL,
  id TEXT NOT NULL,
  version TEXT,
  slug TEXT,
  label TEXT,
  sublabel TEXT,
  visibility TEXT,
  title TEXT,
  form TEXT,
  date TEXT,
  problems TEXT,
  post TEXT,
  seq INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (did, id)
);
CREATE INDEX IF NOT EXISTS posts_changes ON posts (did, seq);
-- A slug is the end of a post's address, so it is used once in a vault. The database refuses a second.
CREATE UNIQUE INDEX IF NOT EXISTS posts_slug ON posts (did, slug) WHERE version IS NOT NULL;

-- Which AT Protocol account an ohm account works in. Made once, when the person connects their
-- PDS and proves the account is theirs. One ohm account, one AT Protocol account, each way.
CREATE TABLE IF NOT EXISTS links (
  user_id TEXT PRIMARY KEY,
  did TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL,
  -- When what the account had already published was first brought into the vault. Empty until then.
  mirrored_at TEXT
);

-- Cortex data is private to a DID and never part of the posts queried by Publish or Mirror.
CREATE TABLE IF NOT EXISTS cortex_memories (
  did TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT,
  description TEXT,
  kind TEXT,
  memory TEXT,
  written_by TEXT,
  seq INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (did, name)
);
CREATE INDEX IF NOT EXISTS cortex_memory_changes ON cortex_memories (did, seq);

CREATE TABLE IF NOT EXISTS cortex_memory_versions (
  did TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  memory TEXT NOT NULL,
  seq INTEGER NOT NULL,
  written_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  replaced_at TEXT NOT NULL,
  PRIMARY KEY (did, name, seq)
);
-- A compare-and-swap and its history cannot be separated by a failed or competing request.
CREATE TRIGGER IF NOT EXISTS cortex_preserve_memory BEFORE UPDATE ON cortex_memories
WHEN OLD.version IS NOT NULL AND (OLD.version IS NOT NEW.version)
BEGIN
  INSERT INTO cortex_memory_versions (did, name, version, memory, seq, written_by, created_at, replaced_at)
  VALUES (OLD.did, OLD.name, OLD.version, OLD.memory, OLD.seq, OLD.written_by, OLD.updated_at, NEW.updated_at);
END;

CREATE TABLE IF NOT EXISTS cortex_notes (
  did TEXT NOT NULL,
  id TEXT NOT NULL,
  text TEXT NOT NULL,
  session TEXT NOT NULL,
  project TEXT,
  written_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  settled_at TEXT,
  outcome TEXT,
  PRIMARY KEY (did, id)
);
CREATE INDEX IF NOT EXISTS cortex_notes_waiting ON cortex_notes (did, settled_at, created_at, id);

CREATE TABLE IF NOT EXISTS cortex_turns (
  did TEXT NOT NULL,
  id TEXT NOT NULL,
  session TEXT NOT NULL,
  agent TEXT NOT NULL,
  project TEXT,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  written_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (did, id)
);
CREATE INDEX IF NOT EXISTS cortex_turns_waiting ON cortex_turns (did, created_at, id);
-- Receipts let a settled turn stay removed if an adapter retries its original delivery.
CREATE TABLE IF NOT EXISTS cortex_turn_receipts (
  did TEXT NOT NULL,
  id TEXT NOT NULL,
  digest TEXT NOT NULL,
  settled_at TEXT,
  PRIMARY KEY (did, id)
);

CREATE TABLE IF NOT EXISTS cortex_skills (
  did TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT,
  description TEXT,
  skill TEXT,
  written_by TEXT,
  approved_version TEXT,
  seq INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (did, name)
);
CREATE INDEX IF NOT EXISTS cortex_skill_changes ON cortex_skills (did, seq);

CREATE TABLE IF NOT EXISTS cortex_tools (
  did TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT,
  description TEXT,
  tool TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  proposed INTEGER NOT NULL DEFAULT 0 CHECK (proposed IN (0, 1)),
  written_by TEXT,
  seq INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (did, name)
);
CREATE INDEX IF NOT EXISTS cortex_tool_changes ON cortex_tools (did, seq);
