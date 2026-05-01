/**
 * 拡張E2E: 複数記事のバッチ生成 + リフレクションループ + エラーリトライ
 * Refs: GitHub #1512
 *
 * Usage (repo seo-content-generator-for-distribution):
 *   npx tsx scripts/e2e-batch-articles-reflection.ts [--mock-competitor] [--mock-e2e] \
 *     [--output-dir DIR] [--keywords "kw1,kw2,..."]
 *
 * 実運用: GEMINI_API_KEY + OPENAI_API_KEY 必須。--mock-e2e は配線検証のみ（LLM 不使用）。
 */
import "dotenv/config";
import "./ensure-import-meta-env";

import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

import type { CompetitorResearchResult } from "../types";
import { generateCompetitorResearch } from "../services/competitorResearchWithWebFetch";
import { generateOutlineV2 } from "../services/outlineGeneratorV2";
import { checkAndFixOutline } from "../services/outlineCheckerV2";
import { generateArticleV2 } from "../services/articleWriterServiceV2";
import { runReflectionRevisionLoop } from "../services/reflectionRevisionService";
import type { IntegrationResult } from "../services/finalProofreadingAgents/types";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const DEFAULT_KEYWORDS = [
  "確定申告 必要書類 初心者",
  "NISA つみたて投資枠 とは",
  "法人税 申告期限",
  "暗号資産 税金",
  "配当金 課税 住民税",
];

const MIN_APPLICATION_RATE = 0.7;
const RETRY_DELAY_MS = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function usage(): void {
  console.error(`Usage: npx tsx scripts/e2e-batch-articles-reflection.ts [options]

Options:
  --mock-competitor   競合調査モック（構成・記事は Gemini 仍を要する）
  --mock-e2e          LLM を呼ばず配線のみ（CI 向け）
  --output-dir DIR    出力親ディレクトリ（省略時: <project>/e2e_batch_output/<timestamp>）
  --keywords "a,b,c"  カンマ区切り（省略時は税務・投資向けデフォルト5件）`);
}

function parseArgs(argv: string[]): {
  mockCompetitor: boolean;
  mockE2e: boolean;
  outputDir: string | null;
  keywords: string[];
} {
  let mockCompetitor = false;
  let mockE2e = false;
  let outputDir: string | null = null;
  let keywords: string[] = [];

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mock-competitor") {
      mockCompetitor = true;
      continue;
    }
    if (a === "--mock-e2e") {
      mockE2e = true;
      continue;
    }
    if (a === "--output-dir" && argv[i + 1]) {
      outputDir = argv[++i];
      continue;
    }
    if (a === "--keywords" && argv[i + 1]) {
      keywords = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (keywords.length === 0) {
    keywords = [...DEFAULT_KEYWORDS];
  }

  return { mockCompetitor, mockE2e, outputDir, keywords };
}

function minimalIntegrationResult(
  score: number,
  criticalLen: number,
  majorLen: number
): IntegrationResult {
  const criticalIssues = Array.from({ length: criticalLen }, (_, i) => ({
    type: "factual-error" as const,
    severity: "critical" as const,
    location: `モック${i}`,
    description: `モック指摘${i}`,
    original: "原文",
    suggestion: "修正",
    confidence: 0.9,
  }));
  const majorIssues = Array.from({ length: majorLen }, (_, i) => ({
    type: "missing-source" as const,
    severity: "major" as const,
    location: `モックM${i}`,
    description: `モック主要${i}`,
    original: "原文",
    suggestion: "出典",
    confidence: 0.8,
  }));

  return {
    overallScore: score,
    passed: score >= 75,
    agentResults: [],
    criticalIssues,
    majorIssues,
    minorIssues: [],
    suggestions: [],
    executionSummary: {
      totalTime: 0,
      successfulAgents: 1,
      failedAgents: 0,
      timeoutAgents: 0,
    },
    regulationScore: {
      factChecking: Math.min(45, Math.round(score * 0.45)),
      reliability: Math.min(25, Math.round(score * 0.25)),
      structureRules: Math.min(18, Math.round(score * 0.18)),
      legalCompliance: Math.min(7, Math.round(score * 0.07)),
      overallQuality: Math.min(5, Math.max(0, score - 90)),
      total: score,
    },
    recommendation: score >= 75 && criticalLen + majorLen === 0 ? "publish" : "revise",
    detailedReport: "",
    sourceInsertions: [],
  };
}

async function generateOneArticlePipeline(
  keyword: string,
  articleDir: string,
  mockCompetitor: boolean
): Promise<{ html: string; title: string; metaDescription: string }> {
  if (mockCompetitor) {
    process.env.SEO_MOCK_COMPETITOR = "1";
  }

  const research: CompetitorResearchResult = await generateCompetitorResearch(
    keyword,
    undefined,
    !mockCompetitor
  );
  writeFileSync(
    resolve(articleDir, "competitor_research.json"),
    JSON.stringify(research, null, 2) + "\n",
    "utf-8"
  );

  const rawOutline = await generateOutlineV2(keyword, research, true, true);
  const { finalOutline, checkResult, wasFixed } = await checkAndFixOutline(
    rawOutline,
    keyword,
    research
  );
  writeFileSync(
    resolve(articleDir, "outline_v2.json"),
    JSON.stringify({ outline: finalOutline, checkResult, wasFixed }, null, 2) + "\n",
    "utf-8"
  );

  const article = await generateArticleV2(finalOutline, keyword, {});
  writeFileSync(
    resolve(articleDir, "article_before_reflection.json"),
    JSON.stringify(article, null, 2) + "\n",
    "utf-8"
  );

  return {
    html: article.htmlContent,
    title: article.title,
    metaDescription: article.metaDescription,
  };
}

async function main(): Promise<void> {
  const { mockCompetitor, mockE2e, outputDir: outArg, keywords } = parseArgs(
    process.argv
  );

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const batchRoot =
    outArg ?? resolve(PROJECT_ROOT, "e2e_batch_output", ts);

  mkdirSync(batchRoot, { recursive: true });

  console.log(`[e2e-batch] project=${PROJECT_ROOT}`);
  console.log(`[e2e-batch] batchRoot=${batchRoot}`);
  console.log(`[e2e-batch] keywords=${keywords.length} mockE2e=${mockE2e} mockCompetitor=${mockCompetitor}`);

  const results: Array<{
    keyword: string;
    ok: boolean;
    error?: string;
    finalScore?: number;
    meanApplicationRate?: number;
    rounds?: number;
    retries: number;
  }> = [];

  for (const keyword of keywords) {
    const slug = keyword.replace(/\s+/g, "_").slice(0, 60);
    const articleDir = resolve(batchRoot, slug);
    mkdirSync(articleDir, { recursive: true });

    let ok = false;
    let lastErr: string | undefined;
    let retries = 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      retries = attempt;
      try {
        if (mockE2e) {
          let pass = 0;
          const refl = await runReflectionRevisionLoop({
            html: "<article><h2>法人税の申告</h2><p>テスト本文</p></article>",
            keyword,
            options: {
              maxRounds: 2,
              targetScore: 75,
              domainVertical: "ken-tax-invest",
            },
            deps: {
              proofread: async () => {
                pass++;
                if (pass === 1) {
                  return minimalIntegrationResult(68, 1, 1);
                }
                return minimalIntegrationResult(78, 0, 0);
              },
              applyProofToHtml: async (h) => h,
            },
          });

          writeFileSync(
            resolve(articleDir, "reflection_result.json"),
            JSON.stringify(refl, null, 2) + "\n",
            "utf-8"
          );

          if (refl.rounds.length > 0 && refl.meanIssueApplicationRate < MIN_APPLICATION_RATE) {
            throw new Error(
              `反映率 ${refl.meanIssueApplicationRate.toFixed(2)} < ${MIN_APPLICATION_RATE}`
            );
          }

          results.push({
            keyword,
            ok: true,
            finalScore: refl.finalProof.overallScore,
            meanApplicationRate: refl.meanIssueApplicationRate,
            rounds: refl.rounds.length,
            retries,
          });
          ok = true;
          break;
        }

        const { html, title, metaDescription } = await generateOneArticlePipeline(
          keyword,
          articleDir,
          mockCompetitor
        );

        const refl = await runReflectionRevisionLoop({
          html,
          keyword,
          options: {
            maxRounds: 3,
            targetScore: 75,
            domainVertical: "ken-tax-invest",
            multiAgent: {
              enableLegalCheck: true,
              timeout: 180_000,
              parallel: true,
            },
          },
        });

        writeFileSync(
          resolve(articleDir, "reflection_result.json"),
          JSON.stringify(refl, null, 2) + "\n",
          "utf-8"
        );

        writeFileSync(
          resolve(articleDir, "article_after_reflection.html"),
          refl.finalHtml,
          "utf-8"
        );
        writeFileSync(
          resolve(articleDir, "article_meta.json"),
          JSON.stringify({ title, metaDescription, keyword }, null, 2) + "\n",
          "utf-8"
        );

        if (refl.rounds.length > 0 && refl.meanIssueApplicationRate < MIN_APPLICATION_RATE) {
          throw new Error(
            `反映率 ${(refl.meanIssueApplicationRate * 100).toFixed(0)}% < ${MIN_APPLICATION_RATE * 100}%`
          );
        }

        results.push({
          keyword,
          ok: true,
          finalScore: refl.finalProof.overallScore,
          meanApplicationRate: refl.meanIssueApplicationRate,
          rounds: refl.rounds.length,
          retries,
        });
        ok = true;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        console.error(`[e2e-batch] FAIL keyword="${keyword}" attempt=${attempt + 1}: ${lastErr}`);
        if (attempt === 0) {
          await sleep(RETRY_DELAY_MS);
        }
      }
    }

    if (!ok) {
      results.push({ keyword, ok: false, error: lastErr, retries });
    }
  }

  const summary = {
    batchRoot,
    mockE2e,
    mockCompetitor,
    passCount: results.filter((r) => r.ok).length,
    total: results.length,
    results,
  };
  writeFileSync(
    resolve(batchRoot, "batch_manifest.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf-8"
  );

  console.log(
    `[e2e-batch] done pass=${summary.passCount}/${summary.total} manifest=${resolve(batchRoot, "batch_manifest.json")}`
  );

  if (summary.passCount < summary.total) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
