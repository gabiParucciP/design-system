#!/usr/bin/env tsx
/**
 * Fetches the Figma file content and updates only app/components/Button.tsx.
 *
 * This script intentionally uses only the file content API so it works with
 * a token that has file_content:read access and does not require
 * file_variables:read.
 */

import fs from "fs";
import path from "path";

const FIGMA_FILE_KEY = "Lt10bBK2NAbygocsLpxtIM";
const BUTTON_NODE_ID = "1:20";
const BUTTON_PATH = path.resolve("app/components/Button.tsx");
const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const APPLY = process.argv.includes("--apply");

type FigmaColor = {
  r: number;
  g: number;
  b: number;
  a?: number;
};

type FigmaPaint = {
  type?: string;
  visible?: boolean;
  color?: FigmaColor;
  opacity?: number;
};

type FigmaNode = {
  id?: string;
  name?: string;
  type?: string;
  visible?: boolean;
  children?: FigmaNode[];
  fills?: FigmaPaint[];
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  characters?: string;
  style?: {
    fontSize?: number;
    fontWeight?: number;
  };
};

type FigmaFileResponse = {
  document: FigmaNode;
};

type ButtonDesign = {
  backgroundColor: string;
  textColor: string;
  borderRadiusPx: number;
  label: string;
};

function rgbToHex(color: FigmaColor, opacity?: number): string {
  const toHex = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");

  const base = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  const alpha = opacity ?? color.a ?? 1;

  if (alpha >= 1) {
    return base;
  }

  return `${base}${toHex(alpha)}`;
}

function getFirstSolidFillHex(node?: FigmaNode): string | null {
  const solidFill = node?.fills?.find(
    (fill) => fill?.type === "SOLID" && fill.visible !== false && fill.color,
  );

  if (!solidFill?.color) {
    return null;
  }

  return rgbToHex(solidFill.color, solidFill.opacity);
}

function getCornerRadius(node: FigmaNode): number {
  if (typeof node.cornerRadius === "number") {
    return node.cornerRadius;
  }

  const radii = [
    node.topLeftRadius,
    node.topRightRadius,
    node.bottomRightRadius,
    node.bottomLeftRadius,
  ].filter((value): value is number => typeof value === "number");

  return radii.length > 0 ? radii[0] : 8;
}

function flattenNodes(node: FigmaNode): FigmaNode[] {
  const result: FigmaNode[] = [node];

  for (const child of node.children ?? []) {
    result.push(...flattenNodes(child));
  }

  return result;
}

function findNodeById(root: FigmaNode, nodeId: string): FigmaNode | null {
  const nodes = flattenNodes(root);
  return nodes.find((node) => node.id === nodeId) ?? null;
}

function findTextNode(node: FigmaNode): FigmaNode | null {
  const nodes = flattenNodes(node);
  return (
    nodes.find((candidate) => candidate.type === "TEXT" && candidate.characters?.trim()) ??
    null
  );
}

async function fetchButtonDesign(): Promise<ButtonDesign> {
  if (!FIGMA_TOKEN) {
    throw new Error("FIGMA_TOKEN env var is required");
  }

  const normalizedNodeId = BUTTON_NODE_ID.replace(":", "-");
  const response = await fetch(
    `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/nodes?ids=${normalizedNodeId}`,
    {
      headers: {
        "X-Figma-Token": FIGMA_TOKEN,
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Figma API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    nodes?: Record<string, { document?: FigmaNode }>;
  };
  const buttonNode =
    data.nodes?.[normalizedNodeId]?.document ??
    data.nodes?.[BUTTON_NODE_ID]?.document ??
    null;

  if (!buttonNode) {
    throw new Error(`Could not find Figma node ${BUTTON_NODE_ID}`);
  }

  const textNode = findTextNode(buttonNode);

  return {
    backgroundColor: getFirstSolidFillHex(buttonNode) ?? "#d9d9d9",
    textColor: getFirstSolidFillHex(textNode ?? undefined) ?? "#000000",
    borderRadiusPx: getCornerRadius(buttonNode),
    label: textNode?.characters?.trim() || "Click Me",
  };
}

function buildButtonSource(design: ButtonDesign): string {
  return `export default function Button({ children }: { children: React.ReactNode }) {
  return (
    <button
      style={{
        backgroundColor: "${design.backgroundColor}",
        color: "${design.textColor}",
        borderRadius: "${design.borderRadiusPx}px",
      }}
      className="py-2.5 px-7.5"
    >
      {children ?? "${design.label}"}
    </button>
  );
}
`;
}

async function main() {
  console.log("Fetching Button component data from Figma...");
  const design = await fetchButtonDesign();
  const nextSource = buildButtonSource(design);
  const currentSource = fs.readFileSync(BUTTON_PATH, "utf8");

  if (currentSource === nextSource) {
    console.log("Button already in sync.");
    process.exit(0);
  }

  console.log("Button component changed in Figma.");
  console.log(`  background: ${design.backgroundColor}`);
  console.log(`  text: ${design.textColor}`);
  console.log(`  radius: ${design.borderRadiusPx}px`);

  if (!APPLY) {
    console.log("Dry-run mode. Pass --apply to update app/components/Button.tsx.");
    process.exit(0);
  }

  fs.writeFileSync(BUTTON_PATH, nextSource);
  console.log("Updated app/components/Button.tsx.");
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
