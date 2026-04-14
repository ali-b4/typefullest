# Typefullest - Product Requirements Document

**Status**: Draft
**Topic**: integrations
**Author**: Ali Baloch + Codex
**Last Updated**: 2026-04-13

---

## Overview

### Problem Statement

Typefully is already the right system for Valantis team collaboration, scheduling, and publishing on X. The gap is its built-in AI writing assistant.

Today, Stevie needs AI help while drafting and revising posts, but Typefully's current AI experience is a poor fit for this use case:

- It is unclear what context the AI is using.
- It does not reliably enforce Valantis brand voice.
- It runs on older-generation AI models.
- It does not provide a dedicated, explainable workflow for learning what "on brand" means.

Ali wants to delegate more content execution to Stevie without having to personally review every draft for tone and brand fit. The solution is not an approval workflow. The solution is a better AI writing assistant that uses static Valantis brand context and writes back into Typefully only after Stevie approves the changes.

### Proposed Solution

Build `typefullest`, a simple local web app for Stevie that mirrors the useful writing workflow of Typefully for X posts and threads, while replacing Typefully's AI layer with a better, context-grounded assistant.

The app should:

- Show recent Typefully drafts in a Typefully-like interface.
- Let Stevie write directly in the app when starting from scratch.
- Use two owner-managed markdown files as the only brand context source.
- Offer both explicit AI actions and an open-ended chat interface.
- Never update Typefully automatically; every AI-generated change must be approved by Stevie first.
- Overwrite the matching Typefully draft after Stevie approves the final text.

### Target Users

**Primary user**: Stevie

- Writes, revises, and schedules Valantis X content
- Needs help drafting and staying on brand
- Should not need technical knowledge to use the tool

**Secondary stakeholder**: Ali

- Maintains the static brand context files outside the app
- Continues supervising content inside Typefully's normal workflow
- Wants lower review burden, not a new moderation system

### Non-Goals

The MVP should explicitly avoid becoming a full social media management platform. Out of scope:

- Replacing Typefully scheduling, publishing, comments, or collaboration
- Approval routing to Ali or any multi-step governance flow
- Learning from feedback or auto-updating brand rules over time
- Media generation or media editing
- Multi-platform support beyond X
- Analytics, performance optimization, or engagement scoring
- In-app editing of brand rules or examples

---

## Goals & Success Metrics

### Goals

- [ ] Give Stevie a better AI-assisted drafting and revision workflow than Typefully's native AI
- [ ] Keep all output grounded in static, owner-controlled brand context
- [ ] Reduce the amount of manual tone rewriting Ali has to do
- [ ] Preserve Typefully as the source of truth for scheduling and publishing

### Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Draft coverage | 100% of Stevie's X drafts are tone-checked in `typefullest` before scheduling | Self-reported workflow + app logs |
| Revision speed | Stevie can import/open a draft, run a tone check or rewrite, and approve a sync in under 2 minutes for normal posts | Usability testing |
| Manual review load | Reduce Ali's manual rewrite requests by 50% within 30 days of adoption | Before/after review comparison |
| Brand consistency | Ali judges at least 80% of sampled posts as "on brand without rewrite" after 30 days | Weekly qualitative audit |
| AI responsiveness | P95 AI response time under 15 seconds for standard single-post and short-thread actions | App telemetry |

---

## User Stories

### User Story 1: Open and edit recent Typefully drafts

**As a** content writer, **I want to** see recent Typefully drafts inside `typefullest` **so that** I can revise copy without jumping between tools.

**Acceptance Criteria**:
- [ ] The app lists recent drafts from the connected Typefully X social set
- [ ] The list supports at least `Drafts` and `Scheduled` views
- [ ] Opening a draft loads its X post/thread content into the editor
- [ ] Existing Typefully metadata such as title, tags, and schedule are preserved unless intentionally changed

### User Story 2: Draft from scratch inside Typefullest

**As a** content writer, **I want to** write directly in `typefullest` **so that** I can use the better AI assistant from the start.

**Acceptance Criteria**:
- [ ] Stevie can create a new local draft in the app without first creating it in Typefully
- [ ] The editor supports both single tweets and threads
- [ ] Stevie can manually edit every post in the thread before syncing
- [ ] A Typefully draft is only created after Stevie approves the content

### User Story 3: Check tone against static brand context

**As a** content writer, **I want to** run a tone check on any draft **so that** I can see whether the copy matches the Valantis brand voice.

**Acceptance Criteria**:
- [ ] The AI uses only the configured brand context files plus the active draft/chat context
- [ ] The tone check returns a clear assessment of what feels off brand
- [ ] The response explains why the copy is off brand in plain language
- [ ] The response does not automatically modify the draft

### User Story 4: Rewrite copy to be more on brand

**As a** content writer, **I want to** generate on-brand rewrites **so that** I can improve weak or off-brand copy faster.

**Acceptance Criteria**:
- [ ] Stevie can trigger rewrite actions from buttons and from chat
- [ ] The AI can rewrite a full post, full thread, or notes entered by Stevie
- [ ] Suggested text is shown before any write-back happens
- [ ] Stevie must explicitly approve before the app overwrites the Typefully draft

### User Story 5: Preserve writing context over time

**As a** content writer, **I want to** reopen prior AI conversations for a draft **so that** I can continue work without losing context.

**Acceptance Criteria**:
- [ ] Chat history is saved per draft
- [ ] History works for both synced Typefully drafts and local unsynced drafts
- [ ] When a local draft is later synced to Typefully, its history remains attached

---

## Requirements

### Must Have (P0)

- Simple local web app with a short README that a non-technical user can follow to run the app
- X-only support for MVP
- Thread support for both reading and writing
- Typefully-like 3-pane writing interface:
  left rail for drafts, center editor, right AI assistant panel
- Recent draft list pulled from Typefully API v2
- Ability to open existing Typefully drafts and edit their X copy
- Ability to create local drafts directly in `typefullest`
- AI actions available as visible buttons:
  `Draft from notes`, `Check tone`, `Rewrite on-brand`, `Explain issues`
- Open-ended chat box for custom rewrite or critique requests
- Static brand context loaded from filesystem, not edited in-app
- Exactly two required brand context files for MVP:
  `context/brand-rules.md`
  `context/examples.md`
- AI must use the brand files on every generation and critique request
- No self-learning, no fine-tuning, no auto-updating of brand rules
- Clear review state before sync:
  original text, proposed text, and approval action
- Existing Typefully drafts are overwritten only after Stevie approves
- Newly written drafts are created in Typefully only after Stevie approves
- In-app confirmation after successful write-back to Typefully
- Saved conversation history per draft
- Preserve existing Typefully schedule, tags, title, and other draft metadata when only the copy is being revised
- Graceful handling for missing or invalid brand files with human-readable error messaging

### Should Have (P1)

- Search or filter within recent drafts
- Side-by-side diff view between current and proposed copy
- Manual refresh of Typefully drafts without reloading the whole app
- Manual reload of brand context files after Ali edits them
- Status badge that shows whether the currently opened draft has been tone-checked in the current session

### Nice to Have (P2)

- Keyboard shortcuts for common AI actions
- Multiple rewrite options in a single response
- Optional local autosave for unsynced drafts

---

## User Flow

### Flow A: Revise an existing Typefully draft

1. Stevie opens `typefullest`
2. The app loads recent Typefully drafts for the configured X social set
3. Stevie selects a draft from the left rail
4. The center editor loads the current tweet/thread
5. Stevie clicks `Check tone` or asks the chat to critique the draft
6. The AI returns:
   - what feels on brand
   - what feels off brand
   - why it feels off brand
   - an optional rewrite or next-step suggestion
7. Stevie clicks `Rewrite on-brand` or asks the chat for a specific rewrite
8. The app shows proposed revised copy
9. Stevie reviews and approves the change
10. The app updates the existing Typefully draft
11. The app shows an in-app success confirmation
12. Stevie continues editing, scheduling, and publishing in Typefully

### Flow B: Start from notes inside Typefullest

1. Stevie opens `typefullest`
2. Stevie creates a new local draft
3. Stevie enters rough notes, bullets, or partial copy
4. Stevie clicks `Draft from notes` or uses chat
5. The AI produces a single tweet or thread draft grounded in the brand files
6. Stevie edits the result manually as needed
7. Stevie approves creation in Typefully
8. The app creates a new Typefully draft and attaches future history to that draft ID
9. The app shows an in-app success confirmation

---

## UX Requirements

### Interface Shape

The app should feel familiar to an existing Typefully user. It does not need to clone Typefully pixel-for-pixel, but it should mirror the same mental model:

- **Left rail**: account context, `Drafts` / `Scheduled` views, recent draft list
- **Center panel**: tweet/thread editor with per-post blocks
- **Right rail**: AI commands, chat, conversation history, and apply/review actions

### Editing Experience

- Support single tweets and multi-post threads
- Let Stevie add, remove, reorder, and directly edit thread posts
- Show X-relevant character guidance per post
- Keep the AI assistant visible while editing
- Make AI actions feel like writing helpers, not modal interruptions

### AI Response Design

For critique-style actions, responses should be structured and concise:

1. Overall assessment
2. Off-brand issues
3. Why those issues matter
4. Suggested rewrite

For rewrite-style actions, responses should clearly separate:

- Proposed copy
- Short rationale
- Apply/replace action

---

## Brand Context Structure

The engineer should build around owner-managed files on disk, not database-managed brand settings.

### Required Files

```text
context/
  brand-rules.md
  examples.md
```

### Brand Context Rules

- Ali edits these files directly outside the app
- The app reads these files and injects them into every AI request
- The app must not let Stevie edit these files from the UI
- The app should fail loudly and clearly if the files are missing
- The app should allow brand context to be reloaded without code changes

### Prompting Rule

Brand context is static and authoritative. The AI should treat:

- `brand-rules.md` as the source of truth for voice, style, audience, and hard rules
- `examples.md` as reference examples of good copy to emulate

The AI must not invent new brand rules or adapt itself based on prior chats.

---

## Technical Considerations

### Dependencies

- Typefully API v2 for draft retrieval, creation, and editing
- A modern LLM API suitable for writing and rewriting tasks
- Local file reads for brand context
- Lightweight persistent storage for:
  draft history
  local unsynced drafts
  app settings

### Typefully API Notes

The current Typefully API design materially shapes the implementation:

- Drafts are scoped under a `social_set_id`
- The app must first discover or configure the correct social set
- X content is represented inside `platforms.x.posts[]`
- Threads must be handled explicitly as arrays of posts
- Editing an existing draft should use Typefully's draft update endpoint
- Creating a new draft should use Typefully's draft creation endpoint

Minimum API coverage for MVP:

- `GET /v2/social-sets`
- `GET /v2/social-sets/{id}/drafts`
- `GET /v2/social-sets/{id}/drafts/{draft_id}`
- `POST /v2/social-sets/{id}/drafts`
- `PATCH /v2/social-sets/{id}/drafts/{draft_id}`

### Architecture Notes

Recommended implementation shape:

- One simple full-stack web app
- Frontend for the editor and AI interface
- Small backend for API keys, Typefully sync, file loading, and history persistence
- Local persistence layer such as SQLite for sessions and local drafts

Important design constraints:

- Typefully remains the system of record for synced drafts
- `typefullest` is a drafting and revision sidecar, not a replacement scheduler
- AI-generated changes should be staged first, then applied only after writer approval
- Syncing copy changes should avoid unintentionally clearing schedule metadata or other draft fields

### Security Considerations

- Store Typefully and LLM API keys in environment variables, never in the UI or repo
- Treat brand files as local trusted inputs controlled by Ali
- Do not train on user data or mutate the brand context automatically
- Keep a simple audit trail of:
  draft opened
  AI action used
  rewrite approved
  Typefully sync success/failure

---

## Open Questions

| Question | Notes | Owner |
|----------|-------|-------|
| Which LLM provider/model should power MVP? | Product requirement is "modern, better than Typefully's current AI," but provider is still open | Engineering + Ali |
| Should the app use one shared Typefully API key or Stevie's personal key? | MVP can assume a single shared API key for the Valantis X social set | Ali |
| Should brand files reload automatically on change or only via manual refresh? | Manual refresh is sufficient for MVP | Engineering |
| Should the draft list include published posts later for repurposing? | Not required for MVP | Ali |
| How should local unsynced drafts be backed up? | Local persistence is enough for MVP; cloud sync is not required | Engineering |

---

## References

- Typefully API overview: https://support.typefully.com/en/articles/8718287-typefully-api
- Typefully API reference: https://typefully.com/docs/api
- Typefully API v1 to v2 migration guide: https://support.typefully.com/en/articles/13133296-typefully-api-v1-v2-migration-guide
- Typefully scheduling behavior: https://support.typefully.com/en/articles/9210135-scheduling-and-calendar

---

## Document Metadata

**Keywords**: Typefully, X, Twitter, AI writing assistant, brand voice, brand rules, rewriting, threads, marketing copy, integration
**Summary**: PRD for Typefullest, a Typefully-adjacent web app that gives Stevie a better brand-aware AI drafting and revision workflow for Valantis X content while preserving Typefully for scheduling and publishing.
