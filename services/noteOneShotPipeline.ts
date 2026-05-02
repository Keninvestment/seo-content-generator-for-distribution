/**
 * orchestrator-note-e2e と E2E 共有: 構成案・任意ペルソナ/一次情報 → 記事本体まで
 * Refs: GitHub #1518, #1512
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { generateArticleV3 } from "./writingAgentV3";

const NOTE_OUTLINE_FILE = "note_narrative_outline_prompt.md";
const KEN_PERSONA_FILE = "ken_persona_context.txt";
const KEN_PRIMARY_FILE = "ken_primary_context.txt";
const RUN_REQUEST_FILE = "run_request.json";

export interface NoteOneShotResult {
  html: string;
  displayTitle: string;
  metaDescription?: string;
  outlinePromptUsed: string;
  kenPersonaUsed: boolean;
  primaryKnowledgeUsed: boolean;
}

export function stripInnerHtml(fragment: string): string {
  return fragment.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function guessTitleFromHtml(html: string, fallback: string): string {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m) {
    const t = stripInnerHtml(m[1]);
    if (t) return t;
  }
  return fallback;
}

export function parseRunRequest(
  raw: string
): { title?: string; displayTitle?: string; metaDescription?: string } {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const str = (k: string) =>
      typeof j[k] === "string" ? (j[k] as string) : undefined;
    return {
      title: str("title"),
      displayTitle: str("displayTitle"),
      metaDescription: str("metaDescription"),
    };
  } catch {
    return {};
  }
}

export async function runNoteGenerationStages(input: {
  outDir: string;
  keyword: string;
}): Promise<NoteOneShotResult> {
  const { outDir, keyword } = input;
  const outlinePath = resolve(outDir, NOTE_OUTLINE_FILE);
  if (!existsSync(outlinePath)) {
    throw new Error(
      `必須ファイルがありません: ${NOTE_OUTLINE_FILE} (expected: ${outlinePath})`
    );
  }

  const outlinePromptUsed = readFileSync(outlinePath, "utf-8");

  const personaPath = resolve(outDir, KEN_PERSONA_FILE);
  const kenPersonaMarkdown = existsSync(personaPath)
    ? readFileSync(personaPath, "utf-8")
    : undefined;

  const primaryKnowledgeUsed = existsSync(resolve(outDir, KEN_PRIMARY_FILE));

  let runRequestMeta: ReturnType<typeof parseRunRequest> = {};
  const runReqPath = resolve(outDir, RUN_REQUEST_FILE);
  if (existsSync(runReqPath)) {
    runRequestMeta = parseRunRequest(readFileSync(runReqPath, "utf-8"));
  }

  const html = await generateArticleV3({
    outline: outlinePromptUsed,
    keyword,
    contentMode: "note",
    kenPersonaMarkdown,
    usePrimaryKnowledge: primaryKnowledgeUsed,
  });

  const displayTitle =
    runRequestMeta.displayTitle ||
    runRequestMeta.title ||
    guessTitleFromHtml(html, keyword);

  return {
    html,
    displayTitle,
    metaDescription: runRequestMeta.metaDescription,
    outlinePromptUsed,
    kenPersonaUsed: Boolean(kenPersonaMarkdown),
    primaryKnowledgeUsed,
  };
}
