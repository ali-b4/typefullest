import { useEffect, useMemo, useRef, useState } from "react";

import {
  createDraft,
  deleteDraft,
  getBootstrap,
  getDraft,
  reloadBrandContext,
  runAiAction,
  syncDraft,
  updateDraft,
} from "./api";
import type {
  AiAction,
  BootstrapResponse,
  DraftDetail,
  DraftSummary,
  DraftUpdateInput,
  DraftView,
  EffortLevel,
  ModelMode,
} from "../shared/types";

type SaveState = "idle" | "saving" | "saved" | "error";

function draftToSummary(draft: DraftDetail): DraftSummary {
  const preview = draft.posts[0]?.text.trim() || "Blank draft";
  return {
    id: draft.id,
    origin: draft.origin,
    title: draft.title,
    status: draft.status,
    preview: preview.length > 120 ? `${preview.slice(0, 117)}...` : preview,
    updatedAt: draft.updatedAt,
    publishAt: draft.publishAt,
    tags: draft.tags,
    syncState: draft.syncState,
    typefullyDraftId: draft.typefullyDraftId,
    socialSetId: draft.socialSetId,
    toneCheckedAt: draft.toneCheckedAt,
    chatCount: draft.chat.length,
  };
}

function draftLabel(preview: string) {
  return preview.trim() || "Blank draft";
}

function relativeDate(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(syncState: DraftSummary["syncState"]) {
  if (syncState === "local") {
    return "Local only";
  }

  if (syncState === "pendingSync") {
    return "Pending sync";
  }

  return "Synced";
}

export function App() {
  const [view, setView] = useState<DraftView>("drafts");
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<DraftDetail | null>(null);
  const [editorState, setEditorState] = useState<DraftUpdateInput | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceContext, setSourceContext] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [effort, setEffort] = useState<EffortLevel>("low");
  const [modelMode, setModelMode] = useState<ModelMode>("default");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isRunningAi, setIsRunningAi] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [detailTab, setDetailTab] = useState<"suggestion" | "history">("suggestion");
  const initialLoadRef = useRef(true);

  const orderedDrafts = useMemo(
    () => bootstrap?.drafts.items ?? [],
    [bootstrap?.drafts.items],
  );

  function mergeDraftIntoList(draft: DraftDetail) {
    setBootstrap((current) => {
      if (!current) {
        return current;
      }

      const items = current.drafts.items.filter((item) => item.id !== draft.id);
      const updatedItems = [draftToSummary(draft), ...items].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );

      return {
        ...current,
        drafts: {
          ...current.drafts,
          items: updatedItems,
        },
      };
    });
  }

  function hydrateDraft(draft: DraftDetail) {
    setSelectedDraft(draft);
    setSelectedDraftId(draft.id);
    setEditorState({
      title: draft.title,
      notes: draft.notes,
      posts: draft.posts.map((post) => ({
        id: post.id,
        text: post.text,
      })),
    });
    setEditorDirty(false);
    setSaveState("idle");
    mergeDraftIntoList(draft);
  }

  function clearDraftSelection() {
    setSelectedDraft(null);
    setEditorState(null);
    setEditorDirty(false);
    setSaveState("idle");
  }

  async function loadDraftDetails(
    draftId: string,
    availableDrafts: DraftSummary[] = orderedDrafts,
  ) {
    setIsLoadingDraft(true);
    try {
      const draft = await getDraft(draftId);
      hydrateDraft(draft);
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to open draft.";

      if (message.includes("removed from Typefullest")) {
        const remainingDrafts = availableDrafts.filter((draft) => draft.id !== draftId);
        const nextDraftId = remainingDrafts[0]?.id ?? null;

        setBootstrap((current) =>
          current
            ? {
                ...current,
                drafts: {
                  ...current.drafts,
                  items: current.drafts.items.filter((item) => item.id !== draftId),
                },
              }
            : current,
        );

        setSelectedDraftId(nextDraftId);
        if (nextDraftId) {
          await loadDraftDetails(nextDraftId, remainingDrafts);
        } else {
          clearDraftSelection();
        }

        setNotice("That draft was deleted in Typefully, so it was removed from Typefullest.");
        setErrorMessage(null);
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsLoadingDraft(false);
    }
  }

  async function persistEditorNow() {
    if (!selectedDraftId || !editorState || !editorDirty) {
      return selectedDraft;
    }

    setSaveState("saving");
    const updated = await updateDraft(selectedDraftId, editorState);
    setSelectedDraft(updated);
    mergeDraftIntoList(updated);
    setEditorDirty(false);
    setSaveState("saved");
    return updated;
  }

  async function openDraft(draftId: string) {
    try {
      await persistEditorNow();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save the current draft.",
      );
      return;
    }

    await loadDraftDetails(draftId);
  }

  async function loadBootstrapState(nextView: DraftView, refresh: boolean) {
    setIsBootstrapping(true);
    try {
      const data = await getBootstrap(nextView, refresh);
      setBootstrap(data);
      setNotice(data.drafts.message);
      setErrorMessage(null);

      const availableIds = new Set(data.drafts.items.map((item) => item.id));
      const nextSelectedId = availableIds.has(selectedDraftId ?? "")
        ? selectedDraftId
        : data.drafts.items[0]?.id ?? null;

      setSelectedDraftId(nextSelectedId);
      if (nextSelectedId) {
        await loadDraftDetails(nextSelectedId, data.drafts.items);
      } else {
        clearDraftSelection();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load Typefullest.",
      );
    } finally {
      setIsBootstrapping(false);
    }
  }

  useEffect(() => {
    void loadBootstrapState(view, initialLoadRef.current);
    initialLoadRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (!selectedDraftId || !editorState || !editorDirty) {
      return;
    }

    setSaveState("saving");
    const handle = window.setTimeout(async () => {
      try {
        const updated = await updateDraft(selectedDraftId, editorState);
        setSelectedDraft(updated);
        mergeDraftIntoList(updated);
        setEditorDirty(false);
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Could not save the draft.",
        );
      }
    }, 450);

    return () => window.clearTimeout(handle);
  }, [editorDirty, editorState, selectedDraftId]);

  const currentDraft = selectedDraft;
  const isLocalOnlyDraft = currentDraft?.syncState === "local";
  const currentPosts = editorState?.posts ?? [];
  const hasCurrentCopy = currentPosts.some((post) => post.text.trim().length > 0);
  const trimmedSourceContext = sourceContext.trim();
  const trimmedChatInput = chatInput.trim();
  const hasSourceMaterial = hasCurrentCopy || trimmedSourceContext.length > 0;
  const canUseAi =
    Boolean(currentDraft) &&
    Boolean(bootstrap?.settings.openAiApiKeyConfigured) &&
    (bootstrap?.brandContext.errors.length ?? 1) === 0;
  const canSyncDraft = Boolean(currentDraft) && hasCurrentCopy && !isSyncing;
  const saveStateLabel =
    saveState === "saving"
      ? "Saving locally..."
      : saveState === "saved"
        ? "Saved locally"
        : saveState === "error"
          ? "Local save failed"
          : currentDraft?.syncState === "pendingSync"
            ? "Local changes pending sync"
            : null;

  async function handleCreateDraft() {
    try {
      setNotice(null);
      setErrorMessage(null);
      await persistEditorNow();
      if (view !== "drafts") {
        setView("drafts");
      }

      const draft = await createDraft();
      hydrateDraft(draft);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create a new draft.",
      );
    }
  }

  function updateEditor(next: DraftUpdateInput) {
    setEditorState(next);
    setEditorDirty(true);
  }

  async function handleAiAction(
    action: AiAction,
    options?: {
      prompt?: string;
      sourceContext?: string;
    },
  ) {
    if (!currentDraft) {
      return;
    }
    if (action === "chat" && !(options?.prompt?.trim())) {
      setErrorMessage("Add a chat prompt before sending it to the assistant.");
      return;
    }
    if (action === "draftFromNotes" && !(options?.sourceContext?.trim())) {
      setErrorMessage("Paste notes or source material before drafting from notes.");
      return;
    }

    setIsRunningAi(true);
    setNotice(null);
    setErrorMessage(null);

    try {
      const latestDraft = (await persistEditorNow()) ?? currentDraft;
      const result = await runAiAction({
        draftId: latestDraft.id,
        action,
        prompt: options?.prompt,
        sourceContext: options?.sourceContext,
        effort,
        modelMode,
      });

      setSelectedDraft((draft) =>
        draft
          ? {
              ...draft,
              chat: result.chat,
              latestSuggestion: result.suggestion,
              toneCheckedAt: result.suggestion.createdAt,
            }
          : draft,
      );

      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          drafts: {
            ...current.drafts,
            items: current.drafts.items.map((item) =>
              item.id === latestDraft.id
                ? {
                    ...item,
                    toneCheckedAt: result.suggestion.createdAt,
                    chatCount: result.chat.length,
                  }
                : item,
            ),
          },
        };
      });

      if (action === "chat") {
        setChatInput("");
      }

      setDetailTab("suggestion");
      setNotice("AI response ready for review.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "AI action could not be completed.",
      );
    } finally {
      setIsRunningAi(false);
    }
  }

  async function handleSync() {
    if (!currentDraft) {
      return;
    }
    if (!hasCurrentCopy) {
      setErrorMessage("Add or generate draft copy before syncing to Typefully.");
      return;
    }

    setIsSyncing(true);
    setNotice(null);
    setErrorMessage(null);

    try {
      const latestDraft = (await persistEditorNow()) ?? currentDraft;
      const result = await syncDraft(latestDraft.id);
      hydrateDraft(result.draft);
      setNotice(result.notice);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sync to Typefully.",
      );
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDeleteLocalDraft() {
    if (!currentDraft || currentDraft.syncState !== "local") {
      return;
    }

    const confirmed = window.confirm(
      "Delete this local-only draft from Typefullest? This will not affect Typefully.",
    );
    if (!confirmed) {
      return;
    }

    const remainingDrafts = orderedDrafts.filter((draft) => draft.id !== currentDraft.id);
    const nextDraftId = remainingDrafts[0]?.id ?? null;

    setIsDeletingDraft(true);
    setNotice(null);
    setErrorMessage(null);

    try {
      await deleteDraft(currentDraft.id);
      setBootstrap((current) =>
        current
          ? {
              ...current,
              drafts: {
                ...current.drafts,
                items: current.drafts.items.filter((item) => item.id !== currentDraft.id),
              },
            }
          : current,
      );

      setSelectedDraftId(nextDraftId);
      if (nextDraftId) {
        await loadDraftDetails(nextDraftId, remainingDrafts);
      } else {
        clearDraftSelection();
      }

      setNotice("Local-only draft deleted.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to delete the local draft.",
      );
    } finally {
      setIsDeletingDraft(false);
    }
  }

  async function handleRefresh() {
    try {
      await persistEditorNow();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save before refresh.",
      );
      return;
    }

    await loadBootstrapState(view, true);
  }

  async function handleReloadBrandContext() {
    try {
      const brandContext = await reloadBrandContext();
      setBootstrap((current) =>
        current
          ? {
              ...current,
              brandContext,
            }
          : current,
      );
      setNotice("Brand context reloaded from disk.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to reload the brand files.",
      );
    }
  }

  function applySuggestion() {
    if (!editorState || !currentDraft?.latestSuggestion) {
      return;
    }

    updateEditor({
      ...editorState,
      posts: currentDraft.latestSuggestion.proposedPosts.map((post, index) => ({
        id: editorState.posts[index]?.id ?? crypto.randomUUID(),
        text: post.text,
      })),
    });
    setNotice("Suggestion applied locally. Sync to Typefully when you are ready.");
  }

  const onboardingMissingKeys = useMemo(() => {
    const missing = [];
    if (!bootstrap?.settings.typefullyApiKeyConfigured) {
      missing.push("TYPEFULLY_API_KEY");
    }
    if (!bootstrap?.settings.openAiApiKeyConfigured) {
      missing.push("OPENAI_API_KEY");
    }
    if (
      bootstrap?.settings.typefullyApiKeyConfigured &&
      !bootstrap.settings.configuredSocialSetId
    ) {
      missing.push("TYPEFULLY_SOCIAL_SET_ID (only if the key can access multiple social sets)");
    }
    return missing;
  }, [bootstrap?.settings]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Valantis writing sidecar</p>
          <h1>Typefullest</h1>
        </div>
        <div className="topbar-controls">
          <label className="compact-control">
            <span>Model</span>
            <select
              value={modelMode}
              onChange={(event) => setModelMode(event.target.value as ModelMode)}
            >
              <option value="default">
                {bootstrap?.settings.openAiDefaultModel ?? "gpt-5.4-mini"}
              </option>
              <option value="highCapability">
                {bootstrap?.settings.openAiHighEffortModel ?? "gpt-5.4"}
              </option>
            </select>
          </label>
          <label className="compact-control">
            <span>Effort</span>
            <select
              value={effort}
              onChange={(event) => setEffort(event.target.value as EffortLevel)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
      </header>

      {(notice || errorMessage) && (
        <div className={`banner ${errorMessage ? "banner-error" : "banner-info"}`}>
          {errorMessage ?? notice}
        </div>
      )}

      <div className="workspace">
        <aside className="panel left-rail">
          <div className="panel-header">
            <div>
              <p className="panel-label">Drafts</p>
              <h2>Typefully mirror</h2>
            </div>
            <button className="button button-primary" onClick={handleCreateDraft}>
              New draft
            </button>
          </div>

          <div className="callout">
            <strong>Manual refresh only.</strong>
            <p>Click the button below to fetch latest updates from Typefully.</p>
            <button className="button button-secondary" onClick={handleRefresh}>
              Fetch latest from Typefully
            </button>
          </div>

          {onboardingMissingKeys.length > 0 && (
            <div className="callout callout-warning">
              <strong>Onboarding still needed</strong>
              <p>Add these values to your local <code>.env</code> file:</p>
              <div className="token-list">
                {onboardingMissingKeys.map((item) => (
                  <span className="token" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="segmented-control">
            <button
              className={view === "drafts" ? "active" : ""}
              onClick={() => void (async () => {
                await persistEditorNow().catch(() => undefined);
                setView("drafts");
              })()}
            >
              Drafts
            </button>
            <button
              className={view === "scheduled" ? "active" : ""}
              onClick={() => void (async () => {
                await persistEditorNow().catch(() => undefined);
                setView("scheduled");
              })()}
            >
              Scheduled
            </button>
          </div>

          <div className="draft-list">
            {isBootstrapping && orderedDrafts.length === 0 ? (
              <div className="empty-state">Loading your draft workspace...</div>
            ) : orderedDrafts.length === 0 ? (
              <div className="empty-state">
                No drafts yet. Create one locally or fetch from Typefully.
              </div>
            ) : (
              orderedDrafts.map((draft) => (
                <button
                  className={`draft-card ${draft.id === selectedDraftId ? "selected" : ""}`}
                  key={draft.id}
                  onClick={() => void openDraft(draft.id)}
                >
                  <div className="draft-card-top">
                    <span className="meta-chip">
                      {draft.origin === "local" ? "Local" : "Typefully"}
                    </span>
                    <span className={`pill pill-${draft.syncState}`}>{statusLabel(draft.syncState)}</span>
                  </div>
                  <p className="draft-title">{draftLabel(draft.preview)}</p>
                  <div className="draft-card-meta">
                    <span>{draft.status === "scheduled" ? "Scheduled" : "Draft"}</span>
                    <span>{draft.publishAt ? relativeDate(draft.publishAt) : "Unscheduled"}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="panel editor-pane">
          <div className="panel-header">
            <div>
              <p className="panel-label">Draft</p>
              <h2>Read-only view</h2>
            </div>
            <div className="editor-actions">
              <span className={`pill pill-${currentDraft?.syncState ?? "local"}`}>
                {currentDraft ? statusLabel(currentDraft.syncState) : "No draft"}
              </span>
              {saveStateLabel && <span className="save-state">{saveStateLabel}</span>}
              <button
                className="button button-primary"
                disabled={!canSyncDraft}
                onClick={() => void handleSync()}
              >
                {isSyncing
                  ? "Syncing..."
                  : currentDraft?.typefullyDraftId
                    ? "Overwrite in Typefully"
                    : "Create in Typefully"}
              </button>
            </div>
          </div>

          {currentDraft && editorState ? (
            <div className="editor-body">
              {isLocalOnlyDraft && (
                <div className="callout callout-local">
                  <div className="callout-actions">
                    <div>
                      <strong>Local-only draft</strong>
                      <p>
                        This draft only lives in Typefullest right now. Create it in
                        Typefully when you are ready to schedule or collaborate there.
                      </p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="button button-primary"
                        disabled={!canSyncDraft}
                        onClick={() => void handleSync()}
                      >
                        {isSyncing ? "Creating..." : "Create in Typefully"}
                      </button>
                      <button
                        className="button button-secondary"
                        disabled={isDeletingDraft}
                        onClick={() => void handleDeleteLocalDraft()}
                      >
                        {isDeletingDraft ? "Deleting..." : "Delete local draft"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {hasCurrentCopy ? (
                <div className="draft-copy-stack">
                  {currentPosts.map((post, index) => (
                    <section className="draft-copy-card" key={post.id}>
                      <div className="draft-copy-top">
                        <span className="meta-chip">Post {index + 1}</span>
                      </div>
                      <p className="draft-copy-text">{post.text}</p>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="empty-state spacious">
                  This draft is blank. Paste source material into the context box and use
                  Draft from notes or Rewrite to create the first revision.
                </div>
              )}

              <section className="insight-panel">
                <div className="insight-header">
                  <div>
                    <p className="panel-label">AI output</p>
                    <h3>{detailTab === "suggestion" ? "Latest suggestion" : "Conversation trail"}</h3>
                  </div>
                  <div className="insight-actions">
                    <div className="segmented-control segmented-control-compact">
                      <button
                        className={detailTab === "suggestion" ? "active" : ""}
                        onClick={() => setDetailTab("suggestion")}
                      >
                        Suggestion
                      </button>
                      <button
                        className={detailTab === "history" ? "active" : ""}
                        onClick={() => setDetailTab("history")}
                      >
                        Conversation
                      </button>
                    </div>
                    <button
                      className="button button-primary"
                      disabled={!currentDraft?.latestSuggestion}
                      onClick={applySuggestion}
                    >
                      Apply locally
                    </button>
                  </div>
                </div>

                {detailTab === "suggestion" ? (
                  currentDraft?.latestSuggestion ? (
                    <div className="suggestion-layout">
                      <div className="suggestion-summary">
                        <p className="assessment">
                          {currentDraft.latestSuggestion.overallAssessment}
                        </p>
                        <p className="rationale">{currentDraft.latestSuggestion.rationale}</p>
                        {currentDraft.latestSuggestion.offBrandIssues.length > 0 && (
                          <div className="issue-list">
                            <h4>What feels off</h4>
                            {currentDraft.latestSuggestion.offBrandIssues.map((issue) => (
                              <p key={issue}>{issue}</p>
                            ))}
                          </div>
                        )}
                        {currentDraft.latestSuggestion.whyItMatters.length > 0 && (
                          <div className="issue-list">
                            <h4>Why it matters</h4>
                            {currentDraft.latestSuggestion.whyItMatters.map((item) => (
                              <p key={item}>{item}</p>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="review-columns">
                        <div>
                          <h4>Current</h4>
                          <div className="copy-preview">
                            {(editorState?.posts ?? []).map((post) => (
                              <p key={post.id}>{post.text || "Blank post"}</p>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4>Proposed</h4>
                          <div className="copy-preview">
                            {currentDraft.latestSuggestion.proposedPosts.map((post, index) => (
                              <p key={`${post.id}-${index}`}>{post.text}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state compact">
                      Run a diagnostic or rewrite to stage a reviewable suggestion.
                    </div>
                  )
                ) : (
                  <div className="history-list wide-history">
                    {(currentDraft?.chat ?? []).length === 0 ? (
                      <div className="empty-state compact">
                        This draft has no AI history yet.
                      </div>
                    ) : (
                      currentDraft?.chat.map((entry) => (
                        <article className={`history-item history-${entry.role}`} key={entry.id}>
                          <div className="history-meta">
                            <strong>{entry.role === "assistant" ? "Assistant" : "You"}</strong>
                            <span>{relativeDate(entry.createdAt)}</span>
                          </div>
                          <p>{entry.message}</p>
                        </article>
                      ))
                    )}
                  </div>
                )}

                <div className="chat-composer">
                  <div className="field-group">
                    <div className="field-heading field-heading-split">
                      <div>
                        <label htmlFor="source-context">Context</label>
                        <span>Used as source material for drafting, diagnostic, and rewrite.</span>
                      </div>
                      <div className="context-actions">
                        <button
                          className="button button-tool"
                          disabled={!canUseAi || isRunningAi || trimmedSourceContext.length === 0}
                          onClick={() =>
                            void handleAiAction("draftFromNotes", {
                              sourceContext: trimmedSourceContext,
                            })
                          }
                        >
                          {isRunningAi ? "Working..." : "Draft from notes"}
                        </button>
                        <button
                          className="button button-tool"
                          disabled={!canUseAi || isRunningAi || !hasSourceMaterial}
                          onClick={() =>
                            void handleAiAction("checkTone", {
                              sourceContext: trimmedSourceContext || undefined,
                            })
                          }
                        >
                          {isRunningAi ? "Working..." : "Diagnostic"}
                        </button>
                        <button
                          className="button button-tool button-tool-accent"
                          disabled={!canUseAi || isRunningAi || !hasSourceMaterial}
                          onClick={() =>
                            void handleAiAction("rewriteOnBrand", {
                              sourceContext: trimmedSourceContext || undefined,
                            })
                          }
                        >
                          {isRunningAi ? "Working..." : "Rewrite"}
                        </button>
                      </div>
                    </div>
                    <textarea
                      id="source-context"
                      value={sourceContext}
                      onChange={(event) => setSourceContext(event.target.value)}
                      placeholder="Paste source material, rough copy, or extra context the assistant may use as editorial input."
                      rows={4}
                    />
                  </div>
                  <div className="field-group">
                    <div className="field-heading">
                      <label htmlFor="chat-request">Chat</label>
                      <span>Only used when you click Send to assistant.</span>
                    </div>
                    <textarea
                      id="chat-request"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder="Ask a specific editorial question or give a one-off instruction."
                      rows={4}
                    />
                  </div>
                  <div className="composer-actions">
                    <button
                      className="button button-primary"
                      disabled={!canUseAi || isRunningAi || trimmedChatInput.length === 0}
                      onClick={() => {
                        setDetailTab("history");
                        void handleAiAction("chat", {
                          prompt: trimmedChatInput,
                          sourceContext: trimmedSourceContext || undefined,
                        });
                      }}
                    >
                      {isRunningAi ? "Sending..." : "Send to assistant"}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="empty-state spacious">
              {isLoadingDraft
                ? "Opening draft..."
                : "Pick a draft from the left rail or create one to start writing."}
            </div>
          )}
        </main>

        <aside className="panel assistant-pane">
          <div className="panel-header">
            <div>
              <p className="panel-label">Assistant</p>
              <h2>Revision controls</h2>
            </div>
            <button className="button button-secondary" onClick={() => void handleReloadBrandContext()}>
              Reload brand files
            </button>
          </div>

          <div className={`status-card ${(bootstrap?.brandContext.errors.length ?? 0) > 0 ? "status-danger" : "status-ok"}`}>
            <span>Brand context</span>
            <strong>
              {(bootstrap?.brandContext.errors.length ?? 0) > 0
                ? "Needs attention"
                : "Ready"}
            </strong>
            <small>
              Loaded: {relativeDate(bootstrap?.brandContext.lastLoadedAt ?? null)}
            </small>
          </div>

          {(bootstrap?.brandContext.errors.length ?? 0) > 0 && (
            <div className="callout callout-warning">
              {bootstrap?.brandContext.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}

          <div className="callout">
            <strong>Editorial help only</strong>
            <p>
              The assistant should revise tone, clarity, and style without adding
              new ideas or new content.
            </p>
          </div>

          <div className="callout">
            <strong>Chat steers revisions</strong>
            <p>
              Use the wide AI output panel for chat, diagnostics, rewrites, and review.
            </p>
          </div>

          <div className="action-grid">
            <div className="mini-legend">
              <strong>Diagnostic</strong>
              <p>Explains what feels on-brand or off-brand.</p>
            </div>
            <div className="mini-legend">
              <strong>Rewrite to brand voice</strong>
              <p>Revises the wording without changing the substance.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
