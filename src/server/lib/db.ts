import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { appConfig } from "./config.js";

mkdirSync(path.dirname(appConfig.dbPath), { recursive: true });

export const db = new Database(appConfig.dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    origin TEXT NOT NULL,
    typefully_key TEXT UNIQUE,
    typefully_draft_id TEXT,
    social_set_id TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    posts_json TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    publish_at TEXT,
    tone_checked_at TEXT,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_synced_at TEXT,
    local_dirty INTEGER NOT NULL DEFAULT 1,
    remote_payload_json TEXT
  );

  CREATE TABLE IF NOT EXISTS chat_entries (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL,
    role TEXT NOT NULL,
    message TEXT NOT NULL,
    action TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS chat_entries_draft_id_idx
    ON chat_entries (draft_id, created_at);

  CREATE TABLE IF NOT EXISTS ai_suggestions (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL,
    action TEXT NOT NULL,
    overall_assessment TEXT NOT NULL,
    off_brand_issues_json TEXT NOT NULL,
    why_it_matters_json TEXT NOT NULL,
    rationale TEXT NOT NULL,
    response_message TEXT NOT NULL,
    proposed_posts_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS ai_suggestions_draft_id_idx
    ON ai_suggestions (draft_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    draft_id TEXT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
