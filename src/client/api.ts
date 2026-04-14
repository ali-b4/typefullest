import type {
  AiRequest,
  AiResponse,
  BootstrapResponse,
  BrandContextStatus,
  CreateDraftInput,
  DraftDetail,
  DraftListResponse,
  DraftUpdateInput,
  DraftView,
  SyncResponse,
} from "../shared/types";

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    throw new Error(
      (payload as { error?: string } | null)?.error ??
        `Request failed with ${response.status}.`,
    );
  }

  return payload as T;
}

export function getBootstrap(view: DraftView, refresh = false) {
  return request<BootstrapResponse>(
    `/api/bootstrap?view=${view}&refresh=${refresh ? "true" : "false"}`,
  );
}

export function getDrafts(view: DraftView, refresh = false) {
  return request<DraftListResponse>(
    `/api/drafts?view=${view}&refresh=${refresh ? "true" : "false"}`,
  );
}

export function getDraft(draftId: string) {
  return request<DraftDetail>(`/api/drafts/${draftId}`);
}

export function createDraft(input?: CreateDraftInput) {
  return request<DraftDetail>("/api/drafts", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export function updateDraft(draftId: string, input: DraftUpdateInput) {
  return request<DraftDetail>(`/api/drafts/${draftId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteDraft(draftId: string) {
  return request<{ ok: true }>(`/api/drafts/${draftId}`, {
    method: "DELETE",
  });
}

export function runAiAction(input: AiRequest) {
  return request<AiResponse>("/api/ai/actions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function syncDraft(draftId: string) {
  return request<SyncResponse>(`/api/drafts/${draftId}/sync`, {
    method: "POST",
  });
}

export function reloadBrandContext() {
  return request<BrandContextStatus>("/api/brand-context/reload", {
    method: "POST",
  });
}
