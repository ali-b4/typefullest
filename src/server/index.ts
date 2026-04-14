import { existsSync } from "node:fs";
import path from "node:path";

import express from "express";
import { z } from "zod";

import type { DraftView } from "../shared/types.js";

import { getBrandContextForPrompt, getBrandContextStatus, loadBrandContext } from "./lib/brand-context.js";
import { getPublicSettings, appConfig } from "./lib/config.js";
import {
  appendChatEntry,
  createLocalDraft,
  deleteLocalDraft,
  getDraft,
  handleMissingRemoteDraft,
  listDrafts,
  markDraftSynced,
  recordAudit,
  reconcileRemoteDrafts,
  setLastFetchedAt,
  storeSuggestion,
  updateDraft,
  upsertRemoteDrafts,
} from "./lib/draft-store.js";
import { logger } from "./lib/logger.js";
import { runAiAction } from "./lib/openai.js";
import {
  createTypefullyDraft,
  getTypefullyDraft,
  listXDrafts,
  TypefullyApiError,
  updateTypefullyDraft,
} from "./lib/typefully.js";

const app = express();

app.use(express.json({ limit: "1mb" }));

const DraftPostInputSchema = z.object({
  id: z
    .string()
    .trim()
    .optional()
    .transform((value) => value ?? ""),
  text: z.string(),
});

const CreateDraftInputSchema = z.object({
  title: z.string().optional(),
  notes: z.string().optional(),
}).strict();

const DraftUpdateInputSchema = z.object({
  title: z.string(),
  notes: z.string(),
  posts: z.array(DraftPostInputSchema).min(1),
}).strict();

const AiRequestSchema = z
  .object({
    draftId: z.string().trim().min(1),
    action: z.enum([
      "draftFromNotes",
      "checkTone",
      "rewriteOnBrand",
      "explainIssues",
      "chat",
    ]),
    sourceContext: z.string().optional(),
    prompt: z.string().optional(),
    effort: z.enum(["low", "medium", "high"]),
    modelMode: z.enum(["default", "highCapability"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === "chat" && !value.prompt?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prompt"],
        message: "Chat requests need a prompt.",
      });
    }
  });

function parseView(view: string | undefined): DraftView {
  return view === "scheduled" ? "scheduled" : "drafts";
}

function formatRefreshFallbackMessage(error: unknown) {
  return error instanceof Error
    ? `Showing local cache only. ${error.message}`
    : "Showing local cache only because Typefully could not be reached.";
}

async function maybeRefreshTypefullyDrafts(shouldRefresh: boolean) {
  if (!shouldRefresh) {
    return null;
  }

  try {
    return await refreshTypefullyDrafts();
  } catch (error) {
    return formatRefreshFallbackMessage(error);
  }
}

function hasMeaningfulPosts(posts: Array<{ text: string }>) {
  return posts.some((post) => post.text.trim().length > 0);
}

function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

async function refreshTypefullyDrafts() {
  logger.info("Refreshing drafts from Typefully.");
  const result = await listXDrafts();
  upsertRemoteDrafts(result.items);
  const reconciliation = reconcileRemoteDrafts(result.items, result.socialSetId);
  setLastFetchedAt(result.fetchedAt);
  recordAudit("typefully.refresh", `Fetched ${result.items.length} drafts from Typefully.`, {
    metadata: {
      socialSetId: result.socialSetId,
      count: result.items.length,
      deletedMirrors: reconciliation.deleted,
      convertedMirrors: reconciliation.converted,
    },
  });

  const reconciliationParts: string[] = [];
  if (reconciliation.deleted > 0) {
    reconciliationParts.push(
      `removed ${reconciliation.deleted} stale mirror${reconciliation.deleted === 1 ? "" : "s"}`,
    );
  }
  if (reconciliation.converted > 0) {
    reconciliationParts.push(
      `converted ${reconciliation.converted} draft${reconciliation.converted === 1 ? "" : "s"} back to local`,
    );
  }
  const reconciliationMessage =
    reconciliationParts.length > 0
      ? ` Also ${reconciliationParts.join(" and ")}.`
      : "";

  return `Fetched ${result.items.length} X drafts from Typefully.${reconciliationMessage}`;
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/bootstrap", async (request, response, next) => {
  try {
    const view = parseView(String(request.query.view ?? "drafts"));
    const shouldRefresh = String(request.query.refresh ?? "false") === "true";
    const message = await maybeRefreshTypefullyDrafts(shouldRefresh);

    response.json({
      settings: getPublicSettings(),
      brandContext: getBrandContextStatus(),
      drafts: listDrafts(view, message),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/drafts", async (request, response, next) => {
  try {
    const view = parseView(String(request.query.view ?? "drafts"));
    const shouldRefresh = String(request.query.refresh ?? "false") === "true";
    const message = await maybeRefreshTypefullyDrafts(shouldRefresh);

    response.json(listDrafts(view, message));
  } catch (error) {
    next(error);
  }
});

app.get("/api/drafts/:draftId", async (request, response, next) => {
  try {
    const draft = getDraft(request.params.draftId);
    if (!draft) {
      response.status(404).json({ error: "Draft not found." });
      return;
    }

    if (draft.typefullyDraftId && draft.socialSetId) {
      try {
        const remote = await getTypefullyDraft(
          draft.typefullyDraftId,
          draft.socialSetId,
        );
        const refreshed = markDraftSynced(draft.id, remote);
        response.json(refreshed);
        return;
      } catch (error) {
        if (error instanceof TypefullyApiError && error.status === 404) {
          const handled = handleMissingRemoteDraft(draft.id);
          if (handled.ok && handled.action === "converted") {
            recordAudit(
              "draft.remote_missing",
              "Remote Typefully draft was deleted, so the local draft was preserved as local-only.",
              { draftId: draft.id },
            );
            response.json(handled.draft);
            return;
          }

          if (handled.ok && handled.action === "deleted") {
            recordAudit(
              "draft.remote_missing",
              "Remote Typefully draft was deleted and the stale mirror was removed locally.",
              { draftId: draft.id },
            );
            response.status(404).json({
              error:
                "This draft was deleted in Typefully and has been removed from Typefullest.",
            });
            return;
          }
        }

        logger.warn(
          "Unable to refresh synced draft from Typefully, serving the cached copy instead.",
          {
            draftId: draft.id,
            typefullyDraftId: draft.typefullyDraftId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        response.json(draft);
        return;
      }
    }

    response.json(draft);
  } catch (error) {
    next(error);
  }
});

app.post("/api/drafts", (request, response, next) => {
  try {
    const body = CreateDraftInputSchema.parse(request.body ?? {});
    const draft = createLocalDraft(body);
    recordAudit("draft.create", "Created a new local draft.", {
      draftId: draft.id,
    });
    response.status(201).json(draft);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/drafts/:draftId", (request, response, next) => {
  try {
    const body = DraftUpdateInputSchema.parse(request.body);
    const draft = updateDraft(request.params.draftId, body);

    if (!draft) {
      response.status(404).json({ error: "Draft not found." });
      return;
    }

    response.json(draft);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/drafts/:draftId", (request, response) => {
  const result = deleteLocalDraft(request.params.draftId);

  if (!result.ok) {
    if (result.reason === "not_found") {
      response.status(404).json({ error: "Draft not found." });
      return;
    }

    response.status(400).json({
      error: "Only local-only drafts can be deleted from Typefullest.",
    });
    return;
  }

  recordAudit("draft.delete", "Deleted a local-only draft.", {
    draftId: request.params.draftId,
  });
  response.json({ ok: true });
});

app.post("/api/drafts/:draftId/sync", async (request, response, next) => {
  try {
    const draft = getDraft(request.params.draftId);
    if (!draft) {
      response.status(404).json({ error: "Draft not found." });
      return;
    }

    if (!hasMeaningfulPosts(draft.posts)) {
      response.status(400).json({
        error: "Add or generate draft copy before syncing to Typefully.",
      });
      return;
    }

    let remote;
    if (draft.typefullyDraftId && draft.socialSetId) {
      try {
        remote = await updateTypefullyDraft({
          socialSetId: draft.socialSetId,
          typefullyDraftId: draft.typefullyDraftId,
          posts: draft.posts,
        });
      } catch (error) {
        if (error instanceof TypefullyApiError && error.status === 404) {
          logger.warn(
            "Remote draft missing during sync, creating a new Typefully draft instead.",
            {
              draftId: draft.id,
              staleTypefullyDraftId: draft.typefullyDraftId,
            },
          );
          remote = await createTypefullyDraft({
            posts: draft.posts,
          });
        } else {
          throw error;
        }
      }
    } else {
      remote = await createTypefullyDraft({
        posts: draft.posts,
      });
    }

    logger.info("Typefully sync completed.", {
      draftId: draft.id,
      typefullyDraftId: remote.typefullyDraftId,
      socialSetId: remote.socialSetId,
      mode: draft.typefullyDraftId ? "update" : "create",
    });

    const synced = markDraftSynced(draft.id, remote);
    recordAudit(
      "draft.sync",
      draft.typefullyDraftId
        ? "Updated an existing Typefully draft."
        : "Created a new Typefully draft.",
      {
        draftId: draft.id,
        metadata: {
          typefullyDraftId: remote.typefullyDraftId,
          socialSetId: remote.socialSetId,
        },
      },
    );

    response.json({
      draft: synced,
      notice: draft.typefullyDraftId
        ? "Typefully draft updated."
        : "Typefully draft created.",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/brand-context/reload", (_request, response) => {
  const status = loadBrandContext(true).status;
  response.json(status);
});

app.post("/api/ai/actions", async (request, response, next) => {
  try {
    const body = AiRequestSchema.parse(request.body);
    const draft = getDraft(body.draftId);
    if (!draft) {
      response.status(404).json({ error: "Draft not found." });
      return;
    }

    const sourceContext = body.sourceContext?.trim() || null;
    const userPrompt = body.prompt?.trim() || null;
    const userMessage = appendChatEntry({
      draftId: draft.id,
      role: "user",
      message:
        body.action === "chat"
          ? userPrompt || "Sent a chat message."
          : body.action === "checkTone"
            ? "Ran diagnostic."
            : body.action === "rewriteOnBrand"
              ? "Requested rewrite to brand voice."
              : body.action,
      action: body.action,
    });
    const brandContext = getBrandContextForPrompt();
    const aiResult = await runAiAction({
      request: body,
      draft,
      brandRules: brandContext.rules,
      examples: brandContext.examples,
    });

    appendChatEntry({
      draftId: draft.id,
      role: "assistant",
      message: aiResult.responseMessage,
      action: body.action,
    });

    const updatedDraft = storeSuggestion({
      draftId: draft.id,
      action: aiResult.action,
      overallAssessment: aiResult.overallAssessment,
      offBrandIssues: aiResult.offBrandIssues,
      whyItMatters: aiResult.whyItMatters,
      rationale: aiResult.rationale,
      responseMessage: aiResult.responseMessage,
      proposedPosts: aiResult.proposedPosts,
    });

    recordAudit("ai.action", `Ran AI action: ${body.action}.`, {
      draftId: draft.id,
      metadata: {
        action: body.action,
        modelMode: body.modelMode,
        effort: body.effort,
        prompt: userPrompt,
        sourceContext,
        userMessageId: userMessage.id,
      },
    });
    if (!updatedDraft.latestSuggestion) {
      throw new Error("AI suggestion could not be loaded after it was saved.");
    }

    response.json({
      suggestion: updatedDraft.latestSuggestion,
      chat: updatedDraft.chat,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({
      error: `Invalid request body. ${formatValidationError(error)}`,
    });
    return;
  }

  const message =
    error instanceof Error ? error.message : "Something went wrong inside Typefullest.";

  logger.error("Unhandled server error.", {
    message,
  });

  response.status(500).json({ error: message });
});

if (existsSync(appConfig.clientDistDir)) {
  app.use(express.static(appConfig.clientDistDir));

  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.sendFile(path.join(appConfig.clientDistDir, "index.html"));
  });
}

app.listen(appConfig.port, "127.0.0.1", () => {
  console.log(`Typefullest server running on http://127.0.0.1:${appConfig.port}`);
});
