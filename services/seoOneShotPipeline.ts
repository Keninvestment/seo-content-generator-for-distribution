/**
 * orchestrator-seo-one-shot と E2E 共有: 競合→構成→（任意記事まで）
 * Refs: GitHub #1512
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

import type { CompetitorResearchResult } from "../types";
import { generateCompetitorResearch } from "./competitorResearchWithWebFetch";
import { generateOutlineV2 } from "./outlineGeneratorV2";
import { checkAndFixOutline } from "./outlineCheckerV2";
import { generateArticleV2 } from "./articleWriterServiceV2";
import { assertNoBannedWords } from "../scripts/lib/bannedWordsGate";

export function readKenPrimaryFromRun(outDir: string): string {
  try {
    const p = resolve(outDir, "ken_primary_context.txt");
    if (!existsSync(p)) return "";
    const s = readFileSync(p, "utf-8").trim();
    return s.length ? s : "";
  } catch {
    return "";
  }
}

export function readPublicYoutubeFromRun(outDir: string): string {
  try {
    const p = resolve(outDir, "public_youtube_context.txt");
    if (!existsSync(p)) return "";
    const s = readFileSync(p, "utf-8").trim();
    return s.length ? s : "";
  } catch {
    return "";
  }
}

/** KEN一次 + YouTube 公開リサーチを1ブロックに */
export function mergeOrchestratorPrimaryBlocks(
  youtubePublic: string,
  kenPrimary: string
): string {
  const parts: string[] = [];
  if (youtubePublic.trim()) parts.push(youtubePublic.trim());
  if (kenPrimary.trim()) parts.push(kenPrimary.trim());
  return parts.join("\n\n---\n\n");
}

export function simpleSlug(keyword: string): string {
  const s = keyword
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u3000-\u9fff_-]/gi, "")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return s || `post-${Date.now()}`;
}

export interface SeoOneShotGenerationResult {
  research: CompetitorResearchResult;
  finalOutline: Awaited<ReturnType<typeof generateOutlineV2>>;
  checkResult: Awaited<ReturnType<typeof checkAndFixOutline>>["checkResult"];
  wasFixed: boolean;
  article: Awaited<ReturnType<typeof generateArticleV2>>;
  displayTitle: string;
  slug: string;
}

/**
 * competitor → outline checker → （outlineOnly でなければ）記事本体まで。
 */
export async function runSeoGenerationStages(input: {
  outDir: string;
  keyword: string;
  mockCompetitor: boolean;
  outlineOnly: boolean;
}): Promise<
  SeoOneShotGenerationResult | { outlineOnly: true; finalOutline: SeoOneShotGenerationResult["finalOutline"]; research: CompetitorResearchResult; checkResult: SeoOneShotGenerationResult["checkResult"]; wasFixed: boolean }
> {
  const { outDir, keyword, mockCompetitor, outlineOnly } = input;

  const kenPrimary = readKenPrimaryFromRun(outDir);
  const ytPublic = readPublicYoutubeFromRun(outDir);
  const orchestratorPrimary = mergeOrchestratorPrimaryBlocks(
    ytPublic,
    kenPrimary
  );

  const research = await generateCompetitorResearch(
    keyword,
    undefined,
    !mockCompetitor
  );

  const rawOutline = await generateOutlineV2(
    keyword,
    research,
    true,
    true,
    orchestratorPrimary
  );
  const { finalOutline, checkResult, wasFixed } = await checkAndFixOutline(
    rawOutline,
    keyword,
    research,
    orchestratorPrimary
  );

  if (outlineOnly) {
    return {
      outlineOnly: true as const,
      finalOutline,
      research,
      checkResult,
      wasFixed,
    };
  }

  const article = await generateArticleV2(finalOutline, keyword, {
    externalPrimaryContext: orchestratorPrimary,
  });
  assertNoBannedWords(article.htmlContent, "seoOneShotPipeline:generateArticleV2");

  const slug = simpleSlug(keyword);
  const displayTitle = finalOutline.title || article.title;

  return {
    research,
    finalOutline,
    checkResult,
    wasFixed,
    article,
    displayTitle,
    slug,
  };
}
