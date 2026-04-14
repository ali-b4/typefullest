import path from "node:path";
import { config as loadEnv } from "dotenv";

import type { Settings } from "../../shared/types.js";

loadEnv();

const rootDir = process.cwd();
const defaultTypefullySocialSetId = "191903";

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function trimOrFallback(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export const appConfig = {
  port: parsePort(process.env.PORT, 8787),
  rootDir,
  dbPath:
    process.env.SQLITE_PATH ?? path.join(rootDir, "data", "typefullest.sqlite"),
  brandRulesPath:
    process.env.BRAND_RULES_PATH ??
    path.join(rootDir, "context", "brand-rules.md"),
  examplesPath:
    process.env.BRAND_EXAMPLES_PATH ??
    path.join(rootDir, "context", "examples.md"),
  typefullyApiBase: trimOrFallback(
    process.env.TYPEFULLY_API_BASE,
    "https://api.typefully.com",
  ).replace(/\/+$/, ""),
  typefullyApiKey: process.env.TYPEFULLY_API_KEY?.trim() ?? "",
  typefullySocialSetId:
    process.env.TYPEFULLY_SOCIAL_SET_ID?.trim() || defaultTypefullySocialSetId,
  openAiApiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
  openAiDefaultModel: process.env.OPENAI_DEFAULT_MODEL?.trim() ?? "gpt-5.4-mini",
  openAiHighEffortModel:
    process.env.OPENAI_HIGH_EFFORT_MODEL?.trim() ?? "gpt-5.4",
  clientDistDir: path.join(rootDir, "dist", "client"),
};

export function getPublicSettings(): Settings {
  return {
    typefullyApiKeyConfigured: appConfig.typefullyApiKey.length > 0,
    openAiApiKeyConfigured: appConfig.openAiApiKey.length > 0,
    openAiDefaultModel: appConfig.openAiDefaultModel,
    openAiHighEffortModel: appConfig.openAiHighEffortModel,
    configuredSocialSetId: appConfig.typefullySocialSetId || null,
  };
}
