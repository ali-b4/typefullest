import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type {
  AiRequest,
  DraftDetail,
  DraftPost,
  EffortLevel,
} from "../../shared/types.js";

import { appConfig } from "./config.js";

const AiOutputSchema = z.object({
  overallAssessment: z.string(),
  offBrandIssues: z.array(z.string()),
  whyItMatters: z.array(z.string()),
  rationale: z.string(),
  responseMessage: z.string(),
  proposedPosts: z.array(
    z.object({
      text: z.string(),
    }),
  ),
});

let cachedClient: OpenAI | null = null;

function getClient() {
  if (!appConfig.openAiApiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Add it to .env so Typefullest can run AI actions.",
    );
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: appConfig.openAiApiKey,
    });
  }

  return cachedClient;
}

function buildActionGuide(action: AiRequest["action"]) {
  switch (action) {
    case "draftFromNotes":
      return "Tighten and clarify the user's notes into cleaner wording without adding new ideas, claims, facts, examples, or angles.";
    case "checkTone":
      return "Critique the current draft for tone and style fit only. Focus on language, framing, and clarity instead of proposing new content.";
    case "rewriteOnBrand":
      return "Edit the current copy to improve tone and style while preserving the exact meaning, ideas, claims, and factual content.";
    case "explainIssues":
      return "Explain what is not working in the current copy at the language and style level, with an editorial suggestion that does not add substance.";
    case "chat":
      return "Act as an editorial assistant for tone and style only. If the user asks for new ideas or fresh content, refuse briefly and stay within revision-only help.";
  }
}

function buildSystemInstructions(action: AiRequest["action"]) {
  return [
    "You are Typefullest, a brand-grounded editorial assistant for Valantis X content.",
    "You are not a content generator, strategist, or ideation partner.",
    "Use the supplied brand rules and examples only as tone-and-style guidance.",
    "The examples are never source material for the user's draft.",
    "Do not reuse, import, paraphrase, or adapt ideas, claims, facts, nouns, hooks, metaphors, CTAs, product details, or structure from the examples unless they already appear in the user's source material.",
    "Do not invent or mutate brand rules.",
    "Treat this as a line-editing task focused on wording, tone, clarity, rhythm, and concision.",
    "Never introduce new ideas, arguments, examples, facts, metrics, entities, benefits, product claims, references, hashtags, cashtags, CTAs, or strategic angles unless the user explicitly provided them in the source material.",
    "Preserve the draft's meaning, factual content, entities, and overall intent.",
    "Preserve the number of posts unless the user explicitly asks to merge or split them.",
    "If the safest edit is minimal, return a minimal edit.",
    "If the user asks for new content or ideation, explain briefly that Typefullest only revises existing language and then stay within that boundary.",
    "Keep suggestions concise, editorial, and practical.",
    `Current action: ${action}. ${buildActionGuide(action)}`,
  ].join(" ");
}

function buildDraftSnapshot(draft: DraftDetail) {
  return JSON.stringify(
    {
      status: draft.status,
      posts: draft.posts.map((post, index) => ({
        index: index + 1,
        text: post.text,
      })),
      recentChat: draft.chat.slice(-8).map((entry) => ({
        role: entry.role,
        message: entry.message,
      })),
    },
    null,
    2,
  );
}

function normalizeProposedPosts(
  posts: Array<{ text: string }>,
  fallback: DraftPost[],
) {
  const cleaned = posts
    .map((post, index) => ({
      id: fallback[index]?.id ?? `${index + 1}`,
      text: post.text.trim(),
    }))
    .filter((post) => post.text.length > 0);

  return cleaned.length > 0 ? cleaned : fallback;
}

function pickModel(mode: AiRequest["modelMode"]) {
  return mode === "highCapability"
    ? appConfig.openAiHighEffortModel
    : appConfig.openAiDefaultModel;
}

function normalizeEffort(effort: EffortLevel) {
  return effort;
}

export async function runAiAction(input: {
  request: AiRequest;
  draft: DraftDetail;
  brandRules: string;
  examples: string;
}) {
  const client = getClient();
  const sourceContext = input.request.sourceContext?.trim();
  const userPrompt = input.request.prompt?.trim();
  const prompt = [
    "Brand rules:",
    input.brandRules,
    "",
    "Reference examples for tone and style only. Do not pull subject matter or ideas from them:",
    input.examples,
    "",
    "Current draft snapshot:",
    buildDraftSnapshot(input.draft),
    "",
    sourceContext
      ? ["Supplemental source material from the user:", sourceContext, ""].join("\n")
      : "",
    "Only revise the draft snapshot and any supplemental source material above.",
    "",
    userPrompt
      ? `User request: ${userPrompt}`
      : "User request: Use the default behavior for the selected action.",
    "",
    "Important constraint: revise tone and style only. Do not introduce new content or new ideas.",
    "",
    "Respond using the provided schema.",
  ].join("\n");

  const response = await client.responses.parse({
    model: pickModel(input.request.modelMode),
    reasoning: {
      effort: normalizeEffort(input.request.effort),
    },
    instructions: buildSystemInstructions(input.request.action),
    input: [
      {
        role: "user",
        content: prompt,
      },
    ],
    text: {
      format: zodTextFormat(AiOutputSchema, "typefullest_ai_response"),
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("The AI response could not be parsed into the expected format.");
  }

  return {
    action: input.request.action,
    overallAssessment: parsed.overallAssessment,
    offBrandIssues: parsed.offBrandIssues,
    whyItMatters: parsed.whyItMatters,
    rationale: parsed.rationale,
    responseMessage: parsed.responseMessage,
    proposedPosts: normalizeProposedPosts(parsed.proposedPosts, input.draft.posts),
  };
}
