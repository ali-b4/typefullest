import { randomUUID } from "node:crypto";

import type {
  AiAction,
  AiSuggestion,
  ChatEntry,
  DraftDetail,
  DraftListResponse,
  DraftPost,
  DraftStatus,
  DraftSummary,
  DraftUpdateInput,
  DraftView,
} from "../../shared/types.js";

import { db } from "./db.js";

interface DraftRow {
  id: string;
  origin: "local" | "typefully";
  typefully_key: string | null;
  typefully_draft_id: string | null;
  social_set_id: string | null;
  title: string;
  status: string;
  posts_json: string;
  tags_json: string;
  notes: string;
  publish_at: string | null;
  tone_checked_at: string | null;
  updated_at: string;
  created_at: string;
  last_synced_at: string | null;
  local_dirty: number;
  remote_payload_json: string | null;
  chat_count?: number;
}

export interface RemoteDraftSnapshot {
  typefullyDraftId: string;
  socialSetId: string;
  title: string;
  status: DraftStatus;
  posts: DraftPost[];
  tags: string[];
  publishAt: string | null;
  updatedAt: string;
  rawPayload: unknown;
}

const listDraftRowsStatement = db.prepare(`
  SELECT
    d.*,
    (
      SELECT COUNT(*)
      FROM chat_entries c
      WHERE c.draft_id = d.id
    ) AS chat_count
  FROM drafts d
`);

const getDraftRowStatement = db.prepare(`
  SELECT
    d.*,
    (
      SELECT COUNT(*)
      FROM chat_entries c
      WHERE c.draft_id = d.id
    ) AS chat_count
  FROM drafts d
  WHERE d.id = ?
`);

const getDraftByTypefullyKeyStatement = db.prepare(`
  SELECT *
  FROM drafts
  WHERE typefully_key = ?
`);

const insertDraftStatement = db.prepare(`
  INSERT INTO drafts (
    id,
    origin,
    typefully_key,
    typefully_draft_id,
    social_set_id,
    title,
    status,
    posts_json,
    tags_json,
    notes,
    publish_at,
    tone_checked_at,
    updated_at,
    created_at,
    last_synced_at,
    local_dirty,
    remote_payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateDraftStatement = db.prepare(`
  UPDATE drafts
  SET
    origin = @origin,
    typefully_key = @typefully_key,
    typefully_draft_id = @typefully_draft_id,
    social_set_id = @social_set_id,
    title = @title,
    status = @status,
    posts_json = @posts_json,
    tags_json = @tags_json,
    notes = @notes,
    publish_at = @publish_at,
    tone_checked_at = @tone_checked_at,
    updated_at = @updated_at,
    last_synced_at = @last_synced_at,
    local_dirty = @local_dirty,
    remote_payload_json = @remote_payload_json
  WHERE id = @id
`);

const listChatEntriesStatement = db.prepare(`
  SELECT *
  FROM chat_entries
  WHERE draft_id = ?
  ORDER BY created_at ASC
`);

const insertChatEntryStatement = db.prepare(`
  INSERT INTO chat_entries (
    id,
    draft_id,
    role,
    message,
    action,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

const getLatestSuggestionStatement = db.prepare(`
  SELECT *
  FROM ai_suggestions
  WHERE draft_id = ?
  ORDER BY created_at DESC
  LIMIT 1
`);

const insertSuggestionStatement = db.prepare(`
  INSERT INTO ai_suggestions (
    id,
    draft_id,
    action,
    overall_assessment,
    off_brand_issues_json,
    why_it_matters_json,
    rationale,
    response_message,
    proposed_posts_json,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertAuditStatement = db.prepare(`
  INSERT INTO audit_log (
    id,
    draft_id,
    type,
    message,
    metadata_json,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

const getAppStateStatement = db.prepare(`
  SELECT value
  FROM app_state
  WHERE key = ?
`);

const setAppStateStatement = db.prepare(`
  INSERT INTO app_state (key, value)
  VALUES (?, ?)
  ON CONFLICT(key)
  DO UPDATE SET value = excluded.value
`);

const deleteChatEntriesStatement = db.prepare(`
  DELETE FROM chat_entries
  WHERE draft_id = ?
`);

const deleteSuggestionsStatement = db.prepare(`
  DELETE FROM ai_suggestions
  WHERE draft_id = ?
`);

const deleteDraftStatement = db.prepare(`
  DELETE FROM drafts
  WHERE id = ?
`);

const listMirroredDraftsBySocialSetStatement = db.prepare(`
  SELECT *
  FROM drafts
  WHERE social_set_id = ?
    AND typefully_draft_id IS NOT NULL
`);

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeStatus(status: string): DraftStatus {
  return status === "scheduled" ? "scheduled" : "draft";
}

function computeSyncState(row: DraftRow) {
  if (!row.typefully_draft_id) {
    return "local" as const;
  }

  return row.local_dirty ? ("pendingSync" as const) : ("synced" as const);
}

function buildPreview(posts: DraftPost[]) {
  const firstPost = posts[0]?.text.trim() ?? "";
  if (!firstPost) {
    return "Blank draft";
  }

  return firstPost.length > 120 ? `${firstPost.slice(0, 117)}...` : firstPost;
}

function rowToSummary(row: DraftRow): DraftSummary {
  const posts = parseJson<DraftPost[]>(row.posts_json, []);
  const tags = parseJson<string[]>(row.tags_json, []);

  return {
    id: row.id,
    origin: row.origin,
    title: row.title,
    status: normalizeStatus(row.status),
    preview: buildPreview(posts),
    updatedAt: row.updated_at,
    publishAt: row.publish_at,
    tags,
    syncState: computeSyncState(row),
    typefullyDraftId: row.typefully_draft_id,
    socialSetId: row.social_set_id,
    toneCheckedAt: row.tone_checked_at,
    chatCount: row.chat_count ?? 0,
  };
}

function rowToChatEntries(draftId: string) {
  return listChatEntriesStatement.all(draftId) as Array<{
    id: string;
    draft_id: string;
    role: "user" | "assistant";
    message: string;
    action: AiAction | null;
    created_at: string;
  }>;
}

function suggestionRowToModel(
  row:
    | {
        id: string;
        draft_id: string;
        action: AiAction;
        overall_assessment: string;
        off_brand_issues_json: string;
        why_it_matters_json: string;
        rationale: string;
        response_message: string;
        proposed_posts_json: string;
        created_at: string;
      }
    | undefined,
): AiSuggestion | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    draftId: row.draft_id,
    action: row.action,
    overallAssessment: row.overall_assessment,
    offBrandIssues: parseJson<string[]>(row.off_brand_issues_json, []),
    whyItMatters: parseJson<string[]>(row.why_it_matters_json, []),
    rationale: row.rationale,
    responseMessage: row.response_message,
    proposedPosts: parseJson<DraftPost[]>(row.proposed_posts_json, []),
    createdAt: row.created_at,
  };
}

function rowToDetail(row: DraftRow): DraftDetail {
  const summary = rowToSummary(row);

  return {
    ...summary,
    posts: parseJson<DraftPost[]>(row.posts_json, []),
    notes: row.notes,
    chat: rowToChatEntries(row.id).map((entry) => ({
      id: entry.id,
      draftId: entry.draft_id,
      role: entry.role,
      message: entry.message,
      action: entry.action ?? undefined,
      createdAt: entry.created_at,
    })),
    latestSuggestion: suggestionRowToModel(
      getLatestSuggestionStatement.get(row.id) as
        | {
            id: string;
            draft_id: string;
            action: AiAction;
            overall_assessment: string;
            off_brand_issues_json: string;
            why_it_matters_json: string;
            rationale: string;
            response_message: string;
            proposed_posts_json: string;
            created_at: string;
          }
        | undefined,
    ),
    lastSyncedAt: row.last_synced_at,
  };
}

function currentTimestamp() {
  return new Date().toISOString();
}

function buildTypefullyKey(socialSetId: string, typefullyDraftId: string) {
  return `${socialSetId}:${typefullyDraftId}`;
}

function createBlankPost() {
  return {
    id: randomUUID(),
    text: "",
  };
}

function loadRequiredDraft(id: string, action: string) {
  const draft = getDraft(id);
  if (!draft) {
    throw new Error(`${action} failed because draft ${id} could not be reloaded.`);
  }

  return draft;
}

export function getLastFetchedAt() {
  return (getAppStateStatement.get("last_typefully_fetch_at") as
    | { value: string }
    | undefined)?.value ?? null;
}

export function setLastFetchedAt(value: string) {
  setAppStateStatement.run("last_typefully_fetch_at", value);
}

export function listDrafts(view: DraftView, message: string | null = null): DraftListResponse {
  const rows = (listDraftRowsStatement.all() as DraftRow[])
    .filter((row) => {
      const status = normalizeStatus(row.status);
      if (view === "scheduled") {
        return status === "scheduled" && Boolean(row.typefully_draft_id);
      }

      return status === "draft" || !row.typefully_draft_id;
    })
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));

  return {
    items: rows.map(rowToSummary),
    lastFetchedAt: getLastFetchedAt(),
    message,
  };
}

export function getDraft(id: string) {
  const row = getDraftRowStatement.get(id) as DraftRow | undefined;
  return row ? rowToDetail(row) : null;
}

export function createLocalDraft(input?: { title?: string; notes?: string }) {
  const now = currentTimestamp();
  const id = randomUUID();

  insertDraftStatement.run(
    id,
    "local",
    null,
    null,
    null,
    input?.title?.trim() || "Untitled draft",
    "draft",
    JSON.stringify([createBlankPost()]),
    JSON.stringify([]),
    input?.notes?.trim() || "",
    null,
    null,
    now,
    now,
    null,
    1,
    null,
  );

  return loadRequiredDraft(id, "Draft creation");
}

export function updateDraft(id: string, input: DraftUpdateInput) {
  const row = getDraftRowStatement.get(id) as DraftRow | undefined;
  if (!row) {
    return null;
  }

  const now = currentTimestamp();
  updateDraftStatement.run({
    ...row,
    id,
    title: input.title.trim() || "Untitled draft",
    notes: input.notes,
    posts_json: JSON.stringify(
      input.posts.map((post) => ({
        id: post.id || randomUUID(),
        text: post.text,
      })),
    ),
    updated_at: now,
    local_dirty: 1,
  });

  return getDraft(id);
}

export function appendChatEntry(entry: Omit<ChatEntry, "id" | "createdAt"> & { action?: AiAction }) {
  const id = randomUUID();
  const createdAt = currentTimestamp();

  insertChatEntryStatement.run(
    id,
    entry.draftId,
    entry.role,
    entry.message,
    entry.action ?? null,
    createdAt,
  );

  return {
    id,
    draftId: entry.draftId,
    role: entry.role,
    message: entry.message,
    action: entry.action,
    createdAt,
  } satisfies ChatEntry;
}

export function storeSuggestion(input: Omit<AiSuggestion, "id" | "createdAt">) {
  const id = randomUUID();
  const createdAt = currentTimestamp();

  insertSuggestionStatement.run(
    id,
    input.draftId,
    input.action,
    input.overallAssessment,
    JSON.stringify(input.offBrandIssues),
    JSON.stringify(input.whyItMatters),
    input.rationale,
    input.responseMessage,
    JSON.stringify(input.proposedPosts),
    createdAt,
  );

  const row = getDraftRowStatement.get(input.draftId) as DraftRow | undefined;
  if (row) {
    updateDraftStatement.run({
      ...row,
      tone_checked_at: createdAt,
    });
  }

  return loadRequiredDraft(input.draftId, "Suggestion storage");
}

export function recordAudit(
  type: string,
  message: string,
  options?: { draftId?: string | null; metadata?: unknown },
) {
  insertAuditStatement.run(
    randomUUID(),
    options?.draftId ?? null,
    type,
    message,
    options?.metadata ? JSON.stringify(options.metadata) : null,
    currentTimestamp(),
  );
}

export function getRecentChatEntries(draftId: string, limit = 8) {
  const entries = rowToChatEntries(draftId);
  return entries.slice(Math.max(entries.length - limit, 0)).map((entry) => ({
    id: entry.id,
    draftId: entry.draft_id,
    role: entry.role,
    message: entry.message,
    action: entry.action ?? undefined,
    createdAt: entry.created_at,
  }));
}

export function markDraftSynced(id: string, remote: RemoteDraftSnapshot) {
  const row = getDraftRowStatement.get(id) as DraftRow | undefined;
  if (!row) {
    return null;
  }

  updateDraftStatement.run({
    ...row,
    origin: "typefully",
    typefully_key: buildTypefullyKey(remote.socialSetId, remote.typefullyDraftId),
    typefully_draft_id: remote.typefullyDraftId,
    social_set_id: remote.socialSetId,
    title: remote.title,
    status: remote.status,
    posts_json: JSON.stringify(remote.posts),
    tags_json: JSON.stringify(remote.tags),
    publish_at: remote.publishAt,
    updated_at: remote.updatedAt,
    last_synced_at: currentTimestamp(),
    local_dirty: 0,
    remote_payload_json: JSON.stringify(remote.rawPayload),
  });

  return loadRequiredDraft(id, "Draft sync");
}

export function deleteLocalDraft(id: string) {
  const row = getDraftRowStatement.get(id) as DraftRow | undefined;
  if (!row) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (row.typefully_draft_id) {
    return { ok: false as const, reason: "synced_draft" as const };
  }

  const transaction = db.transaction(() => {
    deleteChatEntriesStatement.run(id);
    deleteSuggestionsStatement.run(id);
    deleteDraftStatement.run(id);
  });

  transaction();

  return { ok: true as const };
}

function deleteDraftCompletely(id: string) {
  const transaction = db.transaction(() => {
    deleteChatEntriesStatement.run(id);
    deleteSuggestionsStatement.run(id);
    deleteDraftStatement.run(id);
  });

  transaction();
}

export function handleMissingRemoteDraft(id: string) {
  const row = getDraftRowStatement.get(id) as DraftRow | undefined;
  if (!row) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (!row.typefully_draft_id) {
    return { ok: false as const, reason: "not_synced" as const };
  }

  if (row.local_dirty) {
    updateDraftStatement.run({
      ...row,
      origin: "local",
      typefully_key: null,
      typefully_draft_id: null,
      social_set_id: null,
      status: "draft",
      publish_at: null,
      updated_at: currentTimestamp(),
      local_dirty: 1,
      remote_payload_json: null,
    });

    return {
      ok: true as const,
      action: "converted" as const,
      draft: loadRequiredDraft(id, "Remote draft recovery"),
    };
  }

  deleteDraftCompletely(id);

  return {
    ok: true as const,
    action: "deleted" as const,
  };
}

export function reconcileRemoteDrafts(remoteDrafts: RemoteDraftSnapshot[], socialSetId: string) {
  const remoteIds = new Set(remoteDrafts.map((draft) => draft.typefullyDraftId));
  const rows = listMirroredDraftsBySocialSetStatement.all(socialSetId) as DraftRow[];
  let deleted = 0;
  let converted = 0;

  for (const row of rows) {
    if (!row.typefully_draft_id || remoteIds.has(row.typefully_draft_id)) {
      continue;
    }

    const result = handleMissingRemoteDraft(row.id);
    if (!result.ok) {
      continue;
    }

    if (result.action === "deleted") {
      deleted += 1;
      continue;
    }

    converted += 1;
  }

  return {
    deleted,
    converted,
  };
}

export function upsertRemoteDrafts(remoteDrafts: RemoteDraftSnapshot[]) {
  for (const remote of remoteDrafts) {
    const typefullyKey = buildTypefullyKey(
      remote.socialSetId,
      remote.typefullyDraftId,
    );
    const existing = getDraftByTypefullyKeyStatement.get(typefullyKey) as
      | DraftRow
      | undefined;

    if (!existing) {
      insertDraftStatement.run(
        randomUUID(),
        "typefully",
        typefullyKey,
        remote.typefullyDraftId,
        remote.socialSetId,
        remote.title,
        remote.status,
        JSON.stringify(remote.posts),
        JSON.stringify(remote.tags),
        "",
        remote.publishAt,
        null,
        remote.updatedAt,
        remote.updatedAt,
        currentTimestamp(),
        0,
        JSON.stringify(remote.rawPayload),
      );
      continue;
    }

    updateDraftStatement.run({
      ...existing,
      origin: "typefully",
      typefully_key: typefullyKey,
      typefully_draft_id: remote.typefullyDraftId,
      social_set_id: remote.socialSetId,
      title: existing.local_dirty ? existing.title : remote.title,
      status: remote.status,
      posts_json: existing.local_dirty
        ? existing.posts_json
        : JSON.stringify(remote.posts),
      tags_json: JSON.stringify(remote.tags),
      publish_at: remote.publishAt,
      updated_at: existing.local_dirty ? existing.updated_at : remote.updatedAt,
      last_synced_at: currentTimestamp(),
      local_dirty: existing.local_dirty,
      remote_payload_json: JSON.stringify(remote.rawPayload),
    });
  }
}
