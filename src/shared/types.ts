export type DraftOrigin = "local" | "typefully";
export type DraftStatus = "draft" | "scheduled";
export type SyncState = "local" | "synced" | "pendingSync";
export type DraftView = "drafts" | "scheduled";
export type AiAction =
  | "draftFromNotes"
  | "checkTone"
  | "rewriteOnBrand"
  | "explainIssues"
  | "chat";
export type EffortLevel = "low" | "medium" | "high";
export type ModelMode = "default" | "highCapability";

export interface DraftPost {
  id: string;
  text: string;
}

export interface ChatEntry {
  id: string;
  draftId: string;
  role: "user" | "assistant";
  message: string;
  createdAt: string;
  action?: AiAction;
}

export interface AiSuggestion {
  id: string;
  draftId: string;
  action: AiAction;
  overallAssessment: string;
  offBrandIssues: string[];
  whyItMatters: string[];
  rationale: string;
  responseMessage: string;
  proposedPosts: DraftPost[];
  createdAt: string;
}

export interface DraftSummary {
  id: string;
  origin: DraftOrigin;
  title: string;
  status: DraftStatus;
  preview: string;
  updatedAt: string;
  publishAt: string | null;
  tags: string[];
  syncState: SyncState;
  typefullyDraftId: string | null;
  socialSetId: string | null;
  toneCheckedAt: string | null;
  chatCount: number;
}

export interface DraftDetail extends DraftSummary {
  posts: DraftPost[];
  notes: string;
  chat: ChatEntry[];
  latestSuggestion: AiSuggestion | null;
  lastSyncedAt: string | null;
}

export interface DraftListResponse {
  items: DraftSummary[];
  lastFetchedAt: string | null;
  message: string | null;
}

export interface BrandContextStatus {
  hasRules: boolean;
  hasExamples: boolean;
  lastLoadedAt: string | null;
  errors: string[];
}

export interface Settings {
  typefullyApiKeyConfigured: boolean;
  openAiApiKeyConfigured: boolean;
  openAiDefaultModel: string;
  openAiHighEffortModel: string;
  configuredSocialSetId: string | null;
}

export interface BootstrapResponse {
  settings: Settings;
  brandContext: BrandContextStatus;
  drafts: DraftListResponse;
}

export interface DraftUpdateInput {
  title: string;
  notes: string;
  posts: DraftPost[];
}

export interface CreateDraftInput {
  title?: string;
  notes?: string;
}

export interface AiRequest {
  draftId: string;
  action: AiAction;
  sourceContext?: string;
  prompt?: string;
  effort: EffortLevel;
  modelMode: ModelMode;
}

export interface AiResponse {
  suggestion: AiSuggestion;
  chat: ChatEntry[];
}

export interface SyncResponse {
  draft: DraftDetail;
  notice: string;
}
