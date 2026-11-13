-- The list of people who joined the plan from ohmmmm.com. An email address and the time it came,
-- and nothing else. Load it into the database once:
--   wrangler d1 execute ohm-web --remote --config public/home/wrangler.jsonc --file public/home/schema.sql
CREATE TABLE IF NOT EXISTS joiners (
  email TEXT PRIMARY KEY,
  joined_at TEXT NOT NULL
);
