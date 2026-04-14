import { readFileSync } from "node:fs";

import type { BrandContextStatus } from "../../shared/types.js";

import { appConfig } from "./config.js";

interface BrandContextCache {
  status: BrandContextStatus;
  rules: string;
  examples: string;
}

let cache: BrandContextCache | null = null;

function loadFile(path: string, label: string) {
  try {
    return {
      value: readFileSync(path, "utf8").trim(),
      error: null,
    };
  } catch (error) {
    return {
      value: "",
      error: `${label} is missing or unreadable at ${path}.`,
    };
  }
}

export function loadBrandContext(force = false): BrandContextCache {
  if (cache && !force) {
    return cache;
  }

  const rules = loadFile(appConfig.brandRulesPath, "brand-rules.md");
  const examples = loadFile(appConfig.examplesPath, "examples.md");
  const errors = [rules.error, examples.error].filter(
    (item): item is string => Boolean(item),
  );

  cache = {
    rules: rules.value,
    examples: examples.value,
    status: {
      hasRules: rules.value.length > 0,
      hasExamples: examples.value.length > 0,
      lastLoadedAt: new Date().toISOString(),
      errors,
    },
  };

  return cache;
}

export function getBrandContextStatus() {
  return loadBrandContext().status;
}

export function getBrandContextForPrompt() {
  const current = loadBrandContext();

  if (current.status.errors.length > 0) {
    throw new Error(current.status.errors.join(" "));
  }

  return {
    rules: current.rules,
    examples: current.examples,
  };
}
