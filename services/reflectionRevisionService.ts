/**
 * 校閲結果に基づくリフレクション（自動修正）ループ。
 * Refs: GitHub #1512
 *
 * proofread → critical/major の一括修正 → 再校閲を繰り返し、
 * 指摘件数の削減率（自動反映率）とスコア改善を記録する。
 */

import type { IntegrationResult } from "./finalProofreadingAgents/types";
import {
  MultiAgentOrchestrator,
  type MultiAgentConfig,
} from "./finalProofreadingAgents/MultiAgentOrchestrator";
import { reviseBatchIssues } from "./articleRevisionService";

const BATCH_SIZE = 10;

function cleanupArticleHtml(content: string): string {
  let cleaned = content.replace(/\*/g, "");
  cleaned = cleaned
    .replace(/<b>/gi, "<strong>")
    .replace(/<\/b>/gi, "</strong>");
  return cleaned;
}

function severeIssueCount(r: IntegrationResult): number {
  return (r.criticalIssues?.length ?? 0) + (r.majorIssues?.length ?? 0);
}

export interface ReflectionRevisionRoundMetrics {
  roundIndex: number;
  scoreBefore: number;
  scoreAfterReproof: number;
  severeIssuesBefore: number;
  severeIssuesAfterReproof: number;
  /** 当ラウンドで「再校閲後に減った」重大+主要件数 / 修正前の同件数 */
  issueApplicationRate: number;
}

export interface ReflectionRevisionResult {
  finalHtml: string;
  finalProof: IntegrationResult;
  rounds: ReflectionRevisionRoundMetrics[];
  /** severe が1件以上あったラウンドについて、(before - after) / before の平均 */
  meanIssueApplicationRate: number;
  stoppedReason: "target_met" | "no_issues_low_score" | "max_rounds" | "no_severe_remaining";
}

export interface ReflectionRevisionOptions {
  maxRounds?: number;
  targetScore?: number;
  multiAgent?: Partial<MultiAgentConfig>;
  /** CLI / バッチ用: 税務・投資記事では ken-tax-invest を推奨 */
  domainVertical?: "general" | "ken-tax-invest";
}

export type ReflectionProofreadFn = (
  html: string,
  ctx: { domainVertical?: string; keyword?: string }
) => Promise<IntegrationResult>;

export interface ReflectionRevisionDeps {
  proofread?: ReflectionProofreadFn;
  /** 既定は reviseBatchIssues + cleanup */
  applyProofToHtml?: (
    html: string,
    proof: IntegrationResult,
    keyword: string
  ) => Promise<string>;
}

async function applyRevisionsFromProof(
  articleHtml: string,
  proof: IntegrationResult,
  keyword: string
): Promise<string> {
  let current = articleHtml;
  const criticalCount = proof.criticalIssues.length;
  const majorCount = proof.majorIssues.length;

  if (criticalCount > 0) {
    let processed = 0;
    while (processed < criticalCount) {
      const batch = proof.criticalIssues.slice(
        processed,
        Math.min(processed + BATCH_SIZE, criticalCount)
      );
      current = cleanupArticleHtml(
        await reviseBatchIssues({
          originalArticle: current,
          issues: batch,
          category: "critical",
          detailedReport: proof.detailedReport,
          sourceInsertions: proof.sourceInsertions,
          keyword,
        })
      );
      processed += batch.length;
    }
  }

  if (majorCount > 0) {
    let processed = 0;
    while (processed < majorCount) {
      const batch = proof.majorIssues.slice(
        processed,
        Math.min(processed + BATCH_SIZE, majorCount)
      );
      current = cleanupArticleHtml(
        await reviseBatchIssues({
          originalArticle: current,
          issues: batch,
          category: "major",
          detailedReport: proof.detailedReport,
          sourceInsertions: proof.sourceInsertions,
          keyword,
        })
      );
      processed += batch.length;
    }
  }

  return current;
}

function defaultProofread(
  multiConfig: Partial<MultiAgentConfig>,
  domainVertical: "general" | "ken-tax-invest"
): ReflectionProofreadFn {
  return async (html, ctx) => {
    const orchestrator = new MultiAgentOrchestrator({
      enableLegalCheck: true,
      parallel: true,
      timeout: 180_000,
      domainVertical,
      ...multiConfig,
    });
    return orchestrator.execute(html, {
      domainVertical: ctx.domainVertical ?? domainVertical,
      keyword: ctx.keyword,
    });
  };
}

/**
 * 校閲→修正→再校閲を繰り返す。UI の executeAutoRevision + performReProofread のバッチ向け正本。
 */
export async function runReflectionRevisionLoop(
  input: {
    html: string;
    keyword: string;
    options?: ReflectionRevisionOptions;
    deps?: ReflectionRevisionDeps;
  }
): Promise<ReflectionRevisionResult> {
  const {
    html: initialHtml,
    keyword,
    options = {},
    deps = {},
  } = input;

  const maxRounds = options.maxRounds ?? 3;
  const targetScore = options.targetScore ?? 75;
  const domainVertical = options.domainVertical ?? "general";

  const proofread =
    deps.proofread ??
    defaultProofread(options.multiAgent ?? {}, domainVertical);
  const apply =
    deps.applyProofToHtml ??
    ((h, p, k) => applyRevisionsFromProof(h, p, k));

  let html = initialHtml;
  const rounds: ReflectionRevisionRoundMetrics[] = [];
  const rates: number[] = [];
  let stoppedReason: ReflectionRevisionResult["stoppedReason"] =
    "max_rounds";
  let finalProof: IntegrationResult | null = null;

  for (let r = 0; r < maxRounds; r++) {
    const proofBefore = await proofread(html, {
      domainVertical,
      keyword,
    });
    finalProof = proofBefore;
    const severeBefore = severeIssueCount(proofBefore);

    if (
      proofBefore.overallScore >= targetScore &&
      severeBefore === 0
    ) {
      stoppedReason = "target_met";
      break;
    }

    if (severeBefore === 0) {
      stoppedReason = "no_issues_low_score";
      break;
    }

    html = await apply(html, proofBefore, keyword);
    const proofAfter = await proofread(html, {
      domainVertical,
      keyword,
    });
    finalProof = proofAfter;

    const severeAfter = severeIssueCount(proofAfter);
    const resolved = Math.max(0, severeBefore - severeAfter);
    const rate =
      severeBefore > 0 ? resolved / severeBefore : 1;
    rates.push(rate);

    rounds.push({
      roundIndex: r,
      scoreBefore: proofBefore.overallScore,
      scoreAfterReproof: proofAfter.overallScore,
      severeIssuesBefore: severeBefore,
      severeIssuesAfterReproof: severeAfter,
      issueApplicationRate: rate,
    });

    if (
      proofAfter.overallScore >= targetScore &&
      severeAfter === 0
    ) {
      stoppedReason = "target_met";
      break;
    }

    if (severeAfter === 0) {
      stoppedReason = "no_severe_remaining";
      break;
    }
  }

  if (!finalProof) {
    throw new Error("runReflectionRevisionLoop: no proof result");
  }

  const meanIssueApplicationRate =
    rates.length > 0
      ? rates.reduce((a, b) => a + b, 0) / rates.length
      : 1;

  return {
    finalHtml: html,
    finalProof,
    rounds,
    meanIssueApplicationRate,
    stoppedReason,
  };
}
