#!/usr/bin/env tsx
/**
 * sync-figma-tokens.ts
 *
 * Fetches color variables from the Figma Design System file and updates
 * app/globals.css (@theme block) to keep design tokens in sync.
 *
 * Usage:
 *   npx tsx scripts/sync-figma-tokens.ts          # dry-run (shows diff only)
 *   npx tsx scripts/sync-figma-tokens.ts --apply  # writes changes
 *   npx tsx scripts/sync-figma-tokens.ts --apply --force  # ignores snapshot
 *
 * Required env vars:
 *   FIGMA_TOKEN       — Figma personal access token
 *   ANTHROPIC_API_KEY — used to map raw variable names to semantic CSS names
 */

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

// ─── Config ──────────────────────────────────────────────────────────────────

const FIGMA_FILE_KEY = "Lt10bBK2NAbygocsLpxtIM";
const SNAPSHOT_PATH = path.resolve(".figma-snapshot.json");
const GLOBALS_CSS_PATH = path.resolve("app/globals.css");

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

// ─── Types ───────────────────────────────────────────────────────────────────

type VariableMap = Record<string, string>; // "VarName__Mode" → "#rrggbb"

interface Snapshot {
  variables: VariableMap;
  fetchedAt: string;
}

interface FigmaVariable {
  name: string;
  resolvedType: string;
  valuesByMode: Record<string, unknown>;
}

interface FigmaVariableCollection {
  name: string;
  modes: { modeId: string; name: string }[];
  variableIds: string[];
}

// ─── Figma API ────────────────────────────────────────────────────────────────

async function fetchFigmaVariables(): Promise<VariableMap> {
  if (!FIGMA_TOKEN) throw new Error("FIGMA_TOKEN env var is required");

  const res = await fetch(
    `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/variables/local`,
    { headers: { "X-Figma-Token": FIGMA_TOKEN } },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Figma API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    meta: {
      variables: Record<string, FigmaVariable>;
      variableCollections: Record<string, FigmaVariableCollection>;
    };
  };

  const { variables, variableCollections } = data.meta;
  const result: VariableMap = {};

  for (const [, collection] of Object.entries(variableCollections)) {
    const defaultMode =
      collection.modes.find((m) => m.name === "Default") ??
      collection.modes[0];

    for (const varId of collection.variableIds) {
      const variable = variables[varId];
      if (!variable || variable.resolvedType !== "COLOR") continue;

      const modeValue = variable.valuesByMode[defaultMode.modeId] as {
        r: number;
        g: number;
        b: number;
        a?: number;
      } | null;

      if (!modeValue || typeof modeValue.r !== "number") continue;

      const hex = rgbToHex(modeValue.r, modeValue.g, modeValue.b);
      const key = `${variable.name}__${defaultMode.name}`;
      result[key] = hex;
    }
  }

  return result;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

function loadSnapshot(): Snapshot | null {
  if (!fs.existsSync(SNAPSHOT_PATH)) return null;
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
}

function saveSnapshot(variables: VariableMap): void {
  const snapshot: Snapshot = { variables, fetchedAt: new Date().toISOString() };
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

interface Diff {
  changed: { key: string; before: string; after: string }[];
  added: { key: string; value: string }[];
  removed: string[];
}

function computeDiff(current: VariableMap, previous: VariableMap | null): Diff {
  if (!previous) {
    return {
      changed: [],
      added: Object.entries(current).map(([key, value]) => ({ key, value })),
      removed: [],
    };
  }

  const changed: Diff["changed"] = [];
  const added: Diff["added"] = [];
  const removed: string[] = [];

  for (const [key, value] of Object.entries(current)) {
    if (key in previous) {
      if (previous[key] !== value) changed.push({ key, before: previous[key], after: value });
    } else {
      added.push({ key, value });
    }
  }

  for (const key of Object.keys(previous)) {
    if (!(key in current)) removed.push(key);
  }

  return { changed, added, removed };
}

function printDiff(diff: Diff): void {
  if (diff.changed.length === 0 && diff.added.length === 0 && diff.removed.length === 0) {
    console.log("✓ Tokens already in sync — nothing to do.");
    return;
  }

  if (diff.changed.length > 0) {
    console.log(`\n=== Alterado (${diff.changed.length}) ===`);
    for (const { key, before, after } of diff.changed) {
      console.log(`  ${key}\n    antes: ${before}\n    agora: ${after}`);
    }
  }

  if (diff.added.length > 0) {
    console.log(`\n=== Novo (${diff.added.length}) ===`);
    for (const { key, value } of diff.added) {
      console.log(`  ${key}: ${value}`);
    }
  }

  if (diff.removed.length > 0) {
    console.log(`\n=== Removido do Figma (${diff.removed.length}) ===`);
    for (const key of diff.removed) console.log(`  ${key}`);
  }
}

// ─── CSS update ───────────────────────────────────────────────────────────────

// Maps Figma variable name patterns to CSS custom property names in @theme
const VARIABLE_MAP: Record<string, string> = {
  "Colors/Primary/500__Default": "--color-primary",
  "Colors/Secondary/500__Default": "--color-secondary",
  "Colors/Label__Default": "--color-label",
  "Colors/Title__Default": "--color-title",
};

async function buildCssPropertyMap(
  variables: VariableMap,
): Promise<Record<string, string>> {
  // For known variables, use the static map
  const known: Record<string, string> = {};
  const unknown: string[] = [];

  for (const key of Object.keys(variables)) {
    if (VARIABLE_MAP[key]) {
      known[key] = VARIABLE_MAP[key];
    } else {
      unknown.push(key);
    }
  }

  if (unknown.length === 0 || !ANTHROPIC_API_KEY) return known;

  // Ask Claude to suggest CSS property names for unknown variables
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Map these Figma variable names to semantic Tailwind CSS custom property names (--color-xxx format). Return only a JSON object mapping each input key to its CSS property name.\n\n${JSON.stringify(unknown)}`,
      },
    ],
  });

  try {
    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]) as Record<string, string>;
      return { ...known, ...suggestions };
    }
  } catch {
    // Fall back to known-only mapping
  }

  return known;
}

function updateGlobalsCss(
  cssPath: string,
  variables: VariableMap,
  cssPropertyMap: Record<string, string>,
  removedKeys: string[],
): string {
  const css = fs.readFileSync(cssPath, "utf8");

  // Replace or add values within the @theme block
  let updated = css;

  for (const [figmaKey, cssProp] of Object.entries(cssPropertyMap)) {
    const value = variables[figmaKey];
    if (!value) continue;

    const propRegex = new RegExp(`(${escapeRegex(cssProp)}:\\s*)([^;]+)(;)`, "g");
    if (propRegex.test(updated)) {
      updated = updated.replace(propRegex, `$1${value}$3`);
    } else {
      // Insert before closing brace of @theme block
      updated = updated.replace(/(@theme\s*\{[^}]*)(\})/, `$1  ${cssProp}: ${value};\n$2`);
    }
  }

  // Mark removed variables as deprecated
  for (const removedKey of removedKeys) {
    const cssP = cssPropertyMap[removedKey];
    if (!cssP) continue;
    updated = updated.replace(
      new RegExp(`(${escapeRegex(cssP)}:[^;]+;)`),
      `$1 /* deprecated — removed from Figma */`,
    );
  }

  return updated;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching variables from Figma...");
  const current = await fetchFigmaVariables();
  console.log(`  ${Object.keys(current).length} color variables found.`);

  const snapshot = FORCE ? null : loadSnapshot();
  const diff = computeDiff(current, snapshot?.variables ?? null);

  printDiff(diff);

  const hasChanges =
    diff.changed.length > 0 || diff.added.length > 0 || diff.removed.length > 0;

  if (!hasChanges) {
    process.exit(0);
  }

  if (!APPLY) {
    console.log("\nDry-run mode. Pass --apply to write changes.");
    process.exit(0);
  }

  console.log("\nBuilding CSS property map...");
  const cssPropertyMap = await buildCssPropertyMap(current);

  console.log("Updating app/globals.css...");
  const updatedCss = updateGlobalsCss(
    GLOBALS_CSS_PATH,
    current,
    cssPropertyMap,
    diff.removed,
  );
  fs.writeFileSync(GLOBALS_CSS_PATH, updatedCss);

  console.log("Saving snapshot...");
  saveSnapshot(current);

  console.log("\n✓ Done.");
  console.log(`  Modified: app/globals.css`);
  console.log(`  Tokens changed: ${diff.changed.length}`);
  console.log(`  Tokens added: ${diff.added.length}`);
  console.log(`  Tokens deprecated: ${diff.removed.length}`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
