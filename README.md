# Typefullest

Typefullest is a local drafting sidecar for Typefully. It mirrors X drafts from Typefully into a 3-pane workspace, lets the user run brand-grounded AI revision actions locally, and only writes back to Typefully when the user explicitly syncs.

The app is intentionally narrow:

- X drafts and threads only
- Local-first workflow with SQLite persistence
- Static brand context loaded from disk
- AI constrained to editorial help, not ideation or strategy
- Manual refresh and manual sync by design

## Current Status

This project is handoff-ready for a local operator workflow, not a multi-user hosted product.

What is solid today:

- Draft mirroring from Typefully into a local cache
- Local draft creation and deletion
- AI actions for `Draft from notes`, `Diagnostic`, `Rewrite`, and freeform chat
- Review-before-apply workflow for AI suggestions
- Explicit sync back to Typefully
- Draft/chat persistence in SQLite
- Graceful fallback to cached draft content if Typefully is temporarily unavailable

What is intentionally still out of scope:

- Search and filtering
- Side-by-side diffs beyond current/proposed text blocks
- Multi-platform social support
- Auth, permissions, or hosted deployment
- Automated tests beyond typecheck/build verification

## Stack

- Client: React + Vite + TypeScript
- Server: Express + TypeScript
- Storage: SQLite via `better-sqlite3`
- AI: OpenAI Responses API
- External integration: Typefully API v2

## Requirements

- Node.js 20+
- npm 10+
- A Typefully API key
- An OpenAI API key

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the local env file:

   ```bash
   cp .env.example .env
   ```

3. Fill in the required values in `.env`:

   - `OPENAI_API_KEY`
   - `TYPEFULLY_API_KEY`

4. Start the app in development:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:5173](http://localhost:5173).

## Build And Verify

Run the handoff verification command:

```bash
npm run verify
```

That runs:

- client typecheck
- server typecheck
- production build

To run the built app locally:

```bash
npm start
```

The production-style server listens on `http://127.0.0.1:8787`.

## Environment Variables

Required:

```env
OPENAI_API_KEY=
TYPEFULLY_API_KEY=
```

Defaulted:

```env
PORT=8787
OPENAI_DEFAULT_MODEL=gpt-5.4-mini
OPENAI_HIGH_EFFORT_MODEL=gpt-5.4
TYPEFULLY_API_BASE=https://api.typefully.com
LOG_LEVEL=info
DEBUG_TYPEFULLY=false
```

Optional local overrides:

```env
TYPEFULLY_SOCIAL_SET_ID=
SQLITE_PATH=
BRAND_RULES_PATH=
BRAND_EXAMPLES_PATH=
```

Notes:

- Typefullest defaults to social set `191903` for `@ValantisLabs`.
- `TYPEFULLY_SOCIAL_SET_ID` is now just an override, not a required onboarding step.
- The default SQLite file is `data/typefullest.sqlite`.
- Brand context is loaded from `context/brand-rules.md` and `context/examples.md` unless overridden.

## Workflow

1. Fetch drafts from Typefully with the manual refresh button.
2. Open a draft or create a local-only draft.
3. Use one of the AI actions:
   - `Draft from notes` for turning source material into a first-pass draft
   - `Diagnostic` for tone/style critique
   - `Rewrite` for on-brand revision
   - `Chat` for one-off editorial guidance
4. Review the proposed copy in the suggestion panel.
5. Apply the suggestion locally if it looks good.
6. Sync manually to Typefully when ready.

Important behavior:

- Typefully remains the source of truth for synced drafts.
- Sync is never automatic.
- Blank drafts cannot be synced until they have actual copy.
- If Typefully is unavailable while opening a synced draft, the app now serves the cached local mirror instead of failing closed.
- If a synced Typefully draft was deleted remotely, Typefullest either removes the stale mirror or converts it back to a local-only draft if unsynced local changes exist.

## Repo Layout

```text
src/client/          React UI
src/server/          Express server and integrations
src/shared/          Shared TypeScript types
context/             Brand rules and examples loaded at runtime
data/                Local SQLite database
dist/                Build output
```

## Architecture Notes

- The client talks only to the local Express API under `/api`.
- The server owns all persistence and all external API calls.
- Draft mirrors, chat history, AI suggestions, and app state are stored in SQLite.
- Brand context is file-based, cached in memory, and reloadable from the UI.
- Typefully sync preserves remote metadata like scheduling and tags when updating an existing X draft.

## Operational Notes

- This repo is meant for local operation on a trusted machine.
- `node_modules`, `dist`, `.env`, and `data` are generated/local state and should not be treated as source of truth.
- The `context` markdown files are operator-managed content inputs, not app-owned data.
- There is no automated test suite yet; `npm run verify` is the current release gate.

## Known Gaps

- No search or filtering in the draft rail
- No richer diff view for review
- No keyboard shortcuts
- No hosted deployment path, auth layer, or production infra
- No lint/test tooling beyond TypeScript checks and build validation
