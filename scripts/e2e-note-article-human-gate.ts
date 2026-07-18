/**
 * note MVP 最短E2E: テーマ ← OUTPUT_DIR 構成案・任意ペルソナ/一次情報 → 執筆(note) →
 * 11体校閲 → KENレビューゲート → markdown 出力
 *
 * seo-content-generator-for-distribution 直下で実行:
 *
 *   OUTPUT_DIR=<runの絶対パス> npx tsx scripts/e2e-note-article-human-gate.ts \\
 *     --keyword "記事テーマ" [--reflection]
 *
 * Mock（校閲を LLM なしスタブで通す CI 向け）:
 *   KEN_APPROVE=1 npx tsx scripts/e2e-note-article-human-gate.ts \\
 *     --keyword test --mock-proofread --auto-noninteractive --no-clipboard
 *
 * `./run agent_writer_note` が OUTPUT_DIR と一次情報ファイルを準備済みであること。
 *
 * Refs: GitHub #1518, #1512
 */
import "dotenv/config";
import "./ensure-import-meta-env";

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import process from "node:process";

import type { IntegrationResult } from "../services/finalProofreadingAgents/types";
import { htmlArticleToMarkdown } from "../services/htmlArticleToMarkdown";
import { runNoteGenerationStages } from "../services/noteOneShotPipeline";
import { promptKenHumanReviewGate } from "./humanKenReviewGate";

const NOTE_OUTLINE_FILE = "note_narrative_outline_prompt.md";

function usage(): void {
  console.error(`Usage:
  OUTPUT_DIR=<abs-path> npx tsx scripts/e2e-note-article-human-gate.ts \\
    --keyword "<theme>" [options]

Options:
  --reflection        校閲の前にリフレクションループ（時間・コスト増）
  --mock-proofread    11体校閲をスタブにし配線のみ検証（LLM不使用）
  --auto-noninteractive  非TTYで KEN_APPROVE が未設定なら自動で承認扱いにする（ローカル注意）
  --no-clipboard      クリップボードへコピーしない
  --help`);
}

function parseArgs(argv: string[]): {
  keyword: string;
  reflection: boolean;
  mockProofread: boolean;
  autoNoninteractive: boolean;
  noClipboard: boolean;
} {
  let keyword = "";
  let reflection = false;
  let mockProofread = false;
  let autoNoninteractive = false;
  let noClipboard = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keyword" && argv[i + 1]) {
      keyword = argv[++i];
      continue;
    }
    if (a === "--reflection") {
      reflection = true;
      continue;
    }
    if (a === "--mock-proofread") {
      mockProofread = true;
      continue;
    }
    if (a === "--auto-noninteractive") {
      autoNoninteractive = true;
      continue;
    }
    if (a === "--no-clipboard") {
      noClipboard = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
  }

  return {
    keyword,
    reflection,
    mockProofread,
    autoNoninteractive,
    noClipboard,
  };
}

function simplifiedMockProofread(overallScore: number): IntegrationResult {
  type AR = IntegrationResult["agentResults"][number];
  const names = [
    "ProperNounsAgent",
    "NumbersStatsAgent",
    "DatesTimelineAgent",
    "FactsCasesAgent",
    "TechnicalAgent",
    "CompanyAgent",
    "LegalAgent",
    "SourceRequirementAgent",
    "SourceEnhancementAgent",
    "CitationsAgent",
    "IntegrationAgent",
  ];

  const agentResults: AR[] = names.map((agentName): AR => ({
    agentType: "proper-nouns",
    executionTime: 1,
    issues: [],
    suggestions: [],
    confidence: 0.9,
    agentName,
    score: overallScore,
    status: "success",
  }));

  const issue =
    (
      severity: "critical" | "major",
      idx: number
    ): IntegrationResult["criticalIssues"][number] => ({
      agentName: "MockAgent",
      type: "style-issue",
      severity,
      location: `stub-${severity}-${idx}`,
      description: `[mock-proofread] 実LLMスタブです`,
      original: "<p>stub</p>",
      suggestion: `resolve-${idx}`,
      confidence: 0.5,
    });

  return {
    overallScore,
    passed: false,
    agentResults,
    criticalIssues: [issue("critical", 0), issue("critical", 1)],
    majorIssues: [
      issue("major", 0),
      issue("major", 1),
      issue("major", 2),
    ],
    minorIssues: [],
    suggestions: [],
    executionSummary: {
      totalTime: 11,
      successfulAgents: 11,
      failedAgents: 0,
      timeoutAgents: 0,
    },
    regulationScore: {
      factChecking: 20,
      reliability: 20,
      structureRules: 18,
      legalCompliance: 5,
      overallQuality: 5,
      total: overallScore,
    },
    recommendation: "revise",
    detailedReport:
      "mock-proofread のスタブ総合です。実運用では MultiAgent が埋めます。",
    sourceInsertions: [],
    improvementPlan: [],
  };
}

async function proofreadElevenBodies(
  html: string,
  keyword: string,
  domainVertical: "general" | "ken-tax-invest",
  mock: boolean
): Promise<IntegrationResult> {
  if (mock) {
    return simplifiedMockProofread(71);
  }
  const { MultiAgentOrchestrator } = await import(
    "../services/finalProofreadingAgents/MultiAgentOrchestrator"
  );
  const orch = new MultiAgentOrchestrator({
    enableLegalCheck: true,
    parallel: true,
    timeout: 180_000,
    domainVertical,
  });
  return orch.execute(html, { keyword, domainVertical });
}

function pickDomainVertical(keyword: string): "general" | "ken-tax-invest" {
  const taxHints =
    /税|確定申告|nisa|ideco|住民税|法人税|インボイス|節税|控除/.test(keyword);
  const investHints =
    /投資|資産運用|株式|etf|暗号資産|仮想通貨|暗号資産/.test(keyword);
  const enJa = /\b(btc|bitcoin|crypto)\b/i.test(keyword);
  return taxHints || investHints || enJa ? "ken-tax-invest" : "general";
}

function copyDarwinClipboard(text: string): void {
  try {
    execFileSync("/usr/bin/pbcopy", { input: text, encoding: "utf-8" });
    console.log("[e2e-note-human-gate] macOS clipboard: pbcopy 済み\n");
  } catch (e) {
    console.warn("[e2e-note-human-gate] pbcopy 失敗:", e);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const outDir = process.env.OUTPUT_DIR?.trim();
  const {
    keyword,
    reflection,
    mockProofread,
    autoNoninteractive,
    noClipboard,
  } = opts;

  if (!keyword) {
    usage();
    process.exit(2);
  }
  if (!outDir) {
    console.error("ERROR: OUTPUT_DIR が必要です（ランのディレクトリ絶対パス）。");
    usage();
    process.exit(2);
  }

  mkdirSync(outDir, { recursive: true });
  if (!existsSync(resolve(outDir, NOTE_OUTLINE_FILE))) {
    console.error(
      `ERROR: 必須ファイルがありません: ${NOTE_OUTLINE_FILE}\n` +
        `  agent_writer_note の prepare で配置してください。`
    );
    process.exit(2);
  }

  console.log("[e2e-note-human-gate] generation phase…");
  const gen = await runNoteGenerationStages({
    outDir,
    keyword,
  });
  const { html, displayTitle, metaDescription } = gen;

  writeFileSync(
    resolve(outDir, "article.json"),
    JSON.stringify(
      {
        keyword,
        html,
        htmlContent: html,
        title: displayTitle,
        contentMode: "note",
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  let workingHtml = html;
  const domainVertical = pickDomainVertical(keyword);

  if (reflection) {
    const { runReflectionRevisionLoop } = await import(
      "../services/reflectionRevisionService"
    );
    console.log("[e2e-note-human-gate] reflection loop …");
    const refl = await runReflectionRevisionLoop({
      html: workingHtml,
      keyword,
      options: { domainVertical, maxRounds: 2, targetScore: 75 },
      deps: mockProofread
        ? {
            proofread: async () => simplifiedMockProofread(74),
          }
        : {},
    });
    workingHtml = refl.finalHtml;
    writeFileSync(
      resolve(outDir, "reflection_result.json"),
      JSON.stringify(
        {
          stoppedReason: refl.stoppedReason,
          rounds: refl.rounds,
          meanIssueApplicationRate: refl.meanIssueApplicationRate,
          finalOverallScore: refl.finalProof.overallScore,
        },
        null,
        2
      ) + "\n",
      "utf-8"
    );
    writeFileSync(
      resolve(outDir, "article_after_reflection.html"),
      workingHtml,
      "utf-8"
    );
  }

  console.log("[e2e-note-human-gate] 11体校閲 …");
  const proof = await proofreadElevenBodies(
    workingHtml,
    keyword,
    domainVertical,
    mockProofread
  );
  writeFileSync(
    resolve(outDir, "multi_agent_proofread.json"),
    JSON.stringify(proof, null, 2) + "\n",
    "utf-8"
  );

  if (autoNoninteractive && !process.stdin.isTTY && !process.env.KEN_APPROVE) {
    process.env.KEN_APPROVE = "1";
  }

  const decision = await promptKenHumanReviewGate(proof);

  writeFileSync(
    resolve(outDir, "human_review_manifest.json"),
    JSON.stringify(
      {
        kenDecision: decision,
        overallScore: proof.overallScore,
        timestamp_iso: new Date().toISOString(),
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  if (decision !== "approve") {
    console.log(
      "[e2e-note-human-gate] 却下のため article_final は出力しません。exit 1"
    );
    writeFileSync(
      resolve(outDir, "manifest.json"),
      JSON.stringify(
        {
          ok: false,
          phase: "human_rejected",
          keyword,
          contentMode: "note",
        },
        null,
        2
      ) + "\n",
      "utf-8"
    );
    process.exit(1);
  }

  const markdown = htmlArticleToMarkdown(workingHtml, {
    title: displayTitle,
    description: metaDescription,
    keyword,
  });
  writeFileSync(resolve(outDir, "article_final.md"), markdown, "utf-8");
  console.log(
    `[e2e-note-human-gate] Wrote article_final.md (${markdown.length} chars)`
  );

  if (!noClipboard && process.platform === "darwin") {
    copyDarwinClipboard(markdown);
  } else if (!noClipboard && process.platform !== "darwin") {
    console.log(
      "[e2e-note-human-gate] non-Darwin: クリップボードは省略（manual copy or --no-clipboard）"
    );
  }

  writeFileSync(
    resolve(outDir, "manifest.json"),
    JSON.stringify(
      {
        ok: true,
        phase: "e2e_human_gate_done",
        keyword,
        contentMode: "note",
        reflection,
        mockProofread,
        kenApproved: true,
        article_md: "article_final.md",
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );
  console.log("[e2e-note-human-gate] 完了。\n");
}

main()
  .then(() => {
    // 残存ハンドル（エージェントの長時間watchdogタイマー等）でイベントループが
    // 生き残り、親のtimeout killで exit 143 になるのを防ぐ
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
