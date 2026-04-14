import type { DraftPost, DraftStatus } from "../../shared/types.js";

import { appConfig } from "./config.js";
import { logger } from "./logger.js";
import type { RemoteDraftSnapshot } from "./draft-store.js";

interface TypefullyListResponse<T> {
  results?: T[];
  count?: number;
  limit?: number;
  offset?: number;
  next?: string | null;
}

interface TypefullySocialSet {
  id: number | string;
  username?: string;
  name?: string;
}

interface TypefullyDraft {
  id: number | string;
  title?: string | null;
  draft_title?: string | null;
  status?: string | null;
  tags?: Array<string | { slug?: string; name?: string }>;
  publish_at?: string | null;
  scheduled_date?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  preview?: string | null;
  x_post_enabled?: boolean;
  platforms?: {
    x?: {
      enabled?: boolean;
      posts?: Array<{
        text?: string | null;
      }>;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class TypefullyApiError extends Error {
  status: number;
  pathname: string;
  method: string;
  details: unknown;

  constructor(input: {
    status: number;
    pathname: string;
    method: string;
    message: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "TypefullyApiError";
    this.status = input.status;
    this.pathname = input.pathname;
    this.method = input.method;
    this.details = input.details ?? null;
  }
}

function getAuthHeaders() {
  if (!appConfig.typefullyApiKey) {
    throw new Error(
      "TYPEFULLY_API_KEY is missing. Add it to .env so Typefullest can fetch drafts.",
    );
  }

  return {
    Authorization: `Bearer ${appConfig.typefullyApiKey}`,
    "Content-Type": "application/json",
  };
}

async function typefullyFetch<T>(
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const method = init?.method ?? "GET";
  const url = `${appConfig.typefullyApiBase}${pathname}`;

  logger.debug("Typefully request started.", {
    method,
    pathname,
  });

  const response = await fetch(url, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  logger.debug("Typefully response received.", {
    method,
    pathname,
    status: response.status,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let details: unknown = null;
    try {
      const errorResponse = (await response.json()) as {
        error?: { message?: string; details?: unknown };
      };
      message = errorResponse.error?.message ?? message;
      details = errorResponse.error?.details ?? null;
    } catch {
      // fall back to the generic status text above
    }

    logger.error("Typefully request failed.", {
      method,
      pathname,
      status: response.status,
      responseMessage: message,
      details,
    });

    const detailMessage = Array.isArray(details)
      ? details
          .map((detail) => {
            if (
              typeof detail === "object" &&
              detail &&
              "field" in detail &&
              "message" in detail
            ) {
              return `${String(detail.field)}: ${String(detail.message)}`;
            }

            return JSON.stringify(detail);
          })
          .join("; ")
      : "";

    throw new TypefullyApiError({
      status: response.status,
      pathname,
      method,
      details,
      message: detailMessage
        ? `Typefully API request failed: ${message} (${detailMessage})`
        : `Typefully API request failed: ${message}`,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function normalizeTags(
  tags: TypefullyDraft["tags"],
): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => {
      if (typeof tag === "string") {
        return tag;
      }

      return tag.slug ?? tag.name ?? "";
    })
    .filter(Boolean);
}

function normalizeStatus(raw: TypefullyDraft): DraftStatus {
  return raw.status === "scheduled" ? "scheduled" : "draft";
}

function normalizePosts(raw: TypefullyDraft): DraftPost[] {
  const posts = raw.platforms?.x?.posts;
  if (Array.isArray(posts) && posts.length > 0) {
    return posts.map((post, index) => ({
      id: `${raw.id}-${index + 1}`,
      text: post.text ?? "",
    }));
  }

  const preview = raw.preview?.trim() ?? "";
  if (preview) {
    return [
      {
        id: `${raw.id}-preview`,
        text: preview,
      },
    ];
  }

  return [];
}

function normalizeTitle(raw: TypefullyDraft) {
  const explicitTitle = raw.title?.trim() || raw.draft_title?.trim();
  if (explicitTitle) {
    return explicitTitle;
  }

  const firstPost =
    raw.platforms?.x?.posts?.[0]?.text?.trim() ?? raw.preview?.trim() ?? "";
  if (!firstPost) {
    return "Untitled draft";
  }

  return firstPost.length > 48 ? `${firstPost.slice(0, 45)}...` : firstPost;
}

export function normalizeTypefullyDraft(
  raw: TypefullyDraft,
  socialSetId: string,
): RemoteDraftSnapshot {
  return {
    typefullyDraftId: String(raw.id),
    socialSetId,
    title: normalizeTitle(raw),
    status: normalizeStatus(raw),
    posts: normalizePosts(raw),
    tags: normalizeTags(raw.tags),
    publishAt: raw.publish_at ?? raw.scheduled_date ?? null,
    updatedAt: raw.updated_at ?? raw.created_at ?? new Date().toISOString(),
    rawPayload: raw,
  };
}

export async function resolveSocialSetId() {
  if (appConfig.typefullySocialSetId) {
    return appConfig.typefullySocialSetId;
  }

  const socialSets = await typefullyFetch<TypefullyListResponse<TypefullySocialSet>>(
    "/v2/social-sets",
  );
  const results = socialSets.results ?? [];
  const onlySocialSet = results[0];

  if (results.length === 1 && onlySocialSet) {
    return String(onlySocialSet.id);
  }

  throw new Error(
    "TYPEFULLY_SOCIAL_SET_ID is missing. Add it to .env because this API key can access more than one social set.",
  );
}

export async function listXDrafts() {
  const socialSetId = await resolveSocialSetId();
  const allDrafts: TypefullyDraft[] = [];
  const limit = 50;
  let offset = 0;

  while (true) {
    const result = await typefullyFetch<TypefullyListResponse<TypefullyDraft>>(
      `/v2/social-sets/${socialSetId}/drafts?limit=${limit}&offset=${offset}`,
    );
    const pageResults = result.results ?? [];
    allDrafts.push(...pageResults);

    if (pageResults.length < limit) {
      break;
    }

    offset += pageResults.length;
  }

  const items = allDrafts
    .filter((draft) => draft.status === "draft" || draft.status === "scheduled")
    .filter((draft) =>
      Boolean(draft.platforms?.x?.enabled) || Boolean(draft.x_post_enabled),
    )
    .map((draft) => normalizeTypefullyDraft(draft, socialSetId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    socialSetId,
    fetchedAt: new Date().toISOString(),
    items,
  };
}

export async function getTypefullyDraft(
  typefullyDraftId: string,
  socialSetId?: string | null,
) {
  const resolvedSocialSetId = socialSetId ?? (await resolveSocialSetId());
  const raw = await typefullyFetch<TypefullyDraft>(
    `/v2/social-sets/${resolvedSocialSetId}/drafts/${typefullyDraftId}`,
  );

  return normalizeTypefullyDraft(raw, resolvedSocialSetId);
}

export async function createTypefullyDraft(input: {
  posts: DraftPost[];
}) {
  const socialSetId = await resolveSocialSetId();
  const payload = {
    platforms: {
      x: {
        enabled: true,
        posts: input.posts.map((post) => ({
          text: post.text,
        })),
      },
    },
  };

  const created = await typefullyFetch<TypefullyDraft>(
    `/v2/social-sets/${socialSetId}/drafts`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return normalizeTypefullyDraft(created, socialSetId);
}

export async function updateTypefullyDraft(input: {
  socialSetId: string;
  typefullyDraftId: string;
  posts: DraftPost[];
}) {
  const current = await getTypefullyDraft(
    input.typefullyDraftId,
    input.socialSetId,
  );
  const currentRaw = current.rawPayload as TypefullyDraft;
  const platforms = {
    ...(currentRaw.platforms ?? {}),
    x: {
      ...(currentRaw.platforms?.x ?? {}),
      enabled: true,
      posts: input.posts.map((post) => ({
        text: post.text,
      })),
    },
  };

  const payload = {
    ...(current.publishAt ? { publish_at: current.publishAt } : {}),
    ...(current.tags.length > 0 ? { tags: current.tags } : {}),
    platforms,
  };

  const updated = await typefullyFetch<TypefullyDraft>(
    `/v2/social-sets/${input.socialSetId}/drafts/${input.typefullyDraftId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return normalizeTypefullyDraft(updated, input.socialSetId);
}
