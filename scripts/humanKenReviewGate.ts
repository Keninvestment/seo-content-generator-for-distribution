/**
 * CLI 人手レビューゲート: 校閲スコア・issue 一覧を表示し KEN が承認/却下。
 * Refs: GitHub #1512
 */

import type {
  IntegrationResult,
  Issue,
} from "../services/finalProofreadingAgents/types";
import * as readline from "node:readline";
import process from "node:process";

function printDivider(): void {
  console.log("\n" + "=".repeat(72) + "\n");
}

function formatIssues(title: string, issues: Issue[], limit = 80): void {
  console.log(title);
  if (!issues?.length) {
    console.log("  （なし）\n");
    return;
  }
  issues.slice(0, limit).forEach((issue, i) => {
    const agent = issue.agentName ? ` [${issue.agentName}]` : "";
    console.log(`  ${i + 1}. [${issue.severity}]${agent} ${issue.type}`);
    console.log(`     箇所: ${issue.location}`);
    console.log(`     ${issue.description}`);
    const orig =
      issue.original.length > 200
        ? `${issue.original.slice(0, 200)}…`
        : issue.original;
    if (orig) console.log(`     原文抜粋: ${orig}`);
    if (issue.suggestion)
      console.log(`     提案: ${issue.suggestion}`);
    console.log("");
  });
  if (issues.length > limit) {
    console.log(`  … あと ${issues.length - limit} 件`);
  }
}

/**
 * non-TTY のとき環境変数 KEN_APPROVE=1 で承認／0 で却下（E2E 自動化用）。
 */
export async function promptKenHumanReviewGate(
  proof: IntegrationResult
): Promise<"approve" | "reject"> {
  printDivider();
  console.log("【校閲サマリー（11エージェント統合）】");
  console.log(`  総合スコア: ${proof.overallScore} / 100`);
  console.log(`  推奨: ${proof.recommendation}`);
  console.log(`  合格フラグ passed: ${proof.passed}`);
  if (proof.passReason) console.log(`  理由: ${proof.passReason}`);

  console.log("\n【レギュレーション配点】");
  const rs = proof.regulationScore;
  console.log(
    `  factChecking:${rs.factChecking} reliability:${rs.reliability} structure:${rs.structureRules} legal:${rs.legalCompliance} quality:${rs.overallQuality} total:${rs.total}`
  );

  console.log("\n【エージェント別スコア】");
  for (const ar of proof.agentResults) {
    const st = ar.status !== "success" ? ` (${ar.status})` : "";
    console.log(
      `  - ${ar.agentName}${st}: score=${ar.score} time=${ar.executionTime}ms issues=${ar.issues?.length ?? 0}`
    );
  }

  console.log("\n課題件数:");
  console.log(`  critical: ${proof.criticalIssues.length}`);
  console.log(`  major: ${proof.majorIssues.length}`);
  console.log(`  minor: ${proof.minorIssues.length}`);

  formatIssues("\n▼ Critical issues", proof.criticalIssues, 50);
  formatIssues("▼ Major issues", proof.majorIssues, 50);
  formatIssues("▼ Minor issues (先頭のみ)", proof.minorIssues, 15);

  if (!process.stdin.isTTY) {
    const v = process.env.KEN_APPROVE?.trim().toLowerCase();
    if (v === "1" || v === "yes" || v === "true" || v === "approve") {
      console.log("\n[非TTY] KEN_APPROVE により承認として続行。\n");
      return "approve";
    }
    if (v === "0" || v === "no" || v === "false" || v === "reject") {
      console.log("\n[非TTY] KEN_APPROVE により却下して終了。\n");
      return "reject";
    }
    console.error(
      "[humanKenReviewGate] stdin が非TTYのときは KEN_APPROVE=1|0 を設定してください。"
    );
    process.exitCode = 2;
    return "reject";
  }

  console.log("\n入力: [a]=承認（最終出力する） / [r]=却下（出力しない） ");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer: "approve" | "reject" = await new Promise((resolve) => {
    rl.once("line", (line: string) => {
      rl.close();
      const c = line.trim().toLowerCase();
      if (c === "a" || c === "approve" || c === "y" || c === "yes")
        resolve("approve");
      else resolve("reject");
    });
  });

  if (answer === "approve") {
    console.log("→ KEN 承認: 最終 markdown / クリップボードへ進みます。\n");
  } else {
    console.log("→ KEN 却下: final 成果物は書き込みません。\n");
  }
  return answer;
}
