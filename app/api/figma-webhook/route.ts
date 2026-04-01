import { NextRequest, NextResponse } from "next/server";

const FIGMA_PASSCODE = process.env.FIGMA_WEBHOOK_PASSCODE!;
const GITHUB_TOKEN = process.env.GITHUB_PAT!;
const GITHUB_REPO = process.env.GITHUB_REPO!; // "owner/repo"

export async function POST(req: NextRequest) {
  const body = await req.json();

  // 1. Verificar passcode do Figma
  if (body.passcode !== FIGMA_PASSCODE) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Só reagir a publicações da library correta
  if (
    body.event_type !== "FILE_VERSION_UPDATE" ||
    body.file_key !== "Lt10bBK2NAbygocsLpxtIM"
  ) {
    return NextResponse.json({ skipped: true });
  }

  // 3. Disparar o GitHub Actions
  const [owner, repo] = GITHUB_REPO.split("/");
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: "figma-publish" }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: 502 });
  }

  return NextResponse.json({ triggered: true });
}
