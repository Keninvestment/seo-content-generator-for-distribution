/**
 * SEO ワンショットパイプライン（オーケストレータ / shared/article_writing 連携用）
 *
 * Usage (repo root):
 *   OUTPUT_DIR=/abs/run/dir npx tsx scripts/orchestrator-seo-one-shot.ts \
 *     --keyword "SEO対策 とは" [--mock-competitor] [--outline-only] [--wp-send]
 *   （オーケストレータは run 直下に ken_primary_context.txt / public_youtube_context.txt を置ける）
 *
 * Env:
 *   GEMINI_API_KEY — 構成・記事生成に必須（--mock-competitor でも構成以降で必要）
 *   VITE_API_URL | WORDPRESS_API_BASE — WP 送信先（末尾 /api を含む。例 http://localhost:3001/api）
 *   VITE_INTERNAL_API_KEY — WP プロキシが要する場合のみ
 *
 * Refs: GitHub #1512, docs/REGRESSION_BASELINE.md
 */
import "dotenv/config";
import "./ensure-import-meta-env";

import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

import {
  mergeOrchestratorPrimaryBlocks,
  readKenPrimaryFromRun,
  readPublicYoutubeFromRun,
  simpleSlug,
  runSeoGenerationStages,
} from "../services/seoOneShotPipeline";
import { assertNoBannedWords } from "./lib/bannedWordsGate";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

function usage(): void {
  console.error(`Usage: OUTPUT_DIR=<abs-path> npx tsx scripts/orchestrator-seo-one-shot.ts --keyword "<kw>" [options]

Options:
  --mock-competitor   competitorResearchWithWebFetch.ts のモック経路（?mock=true 相当）
  --outline-only      構成まで（記事 HTML 生成・WP 送信をスキップ）
  --wp-send           wp_payload と同じ JSON で POST .../wordpress/create-post を実行`);
}

function parseArgs(argv: string[]): {
  keyword: string;
  mockCompetitor: boolean;
  outlineOnly: boolean;
  wpSend: boolean;
} {
  let keyword = "";
  let mockCompetitor = false;
  let outlineOnly = false;
  let wpSend = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keyword" && argv[i + 1]) {
      keyword = argv[++i];
      continue;
    }
    if (a === "--mock-competitor") {
      mockCompetitor = true;
      continue;
    }
    if (a === "--outline-only") {
      outlineOnly = true;
      continue;
    }
    if (a === "--wp-send") {
      wpSend = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
  }

  return { keyword, mockCompetitor, outlineOnly, wpSend };
}

function wpArticlePayload(input: {
  title: string;
  htmlContent: string;
  metaDescription: string;
  keyword: string;
  slug: string;
}) {
  return {
    title: input.title,
    htmlContent: input.htmlContent,
    metaDescription: input.metaDescription,
    keyword: input.keyword,
    slug: input.slug,
  };
}

async function wordPressCreatePostMin(input: {
  title: string;
  content: string;
  status: "draft" | "publish";
  slug?: string;
}): Promise<{ link: string; id: number }> {
  const baseRaw =
    process.env.VITE_API_URL ||
    process.env.WORDPRESS_API_BASE ||
    "http://localhost:3001/api";
  const base = baseRaw.replace(/\/$/, "");
  const url = `${base}/wordpress/create-post`;
  const apiKey = process.env.VITE_INTERNAL_API_KEY || "";
  const body: Record<string, string> = {
    title: input.title,
    content: input.content,
    status: input.status,
  };
  if (input.slug) body.slug = input.slug;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WordPress proxy error ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as { link: string; id: number };
  return data;
}

async function main(): Promise<void> {
  const { keyword, mockCompetitor, outlineOnly, wpSend } = parseArgs(
    process.argv
  );
  const outDir = process.env.OUTPUT_DIR?.trim();

  if (!keyword) {
    usage();
    process.exit(2);
  }
  if (!outDir) {
    console.error(
      "ERROR: OUTPUT_DIR is required (absolute path to run directory)."
    );
    usage();
    process.exit(2);
  }

  mkdirSync(outDir, { recursive: true });

  if (mockCompetitor) {
    process.env.SEO_MOCK_COMPETITOR = "1";
  }

  console.log(`[orchestrator-seo] project_root=${PROJECT_ROOT}`);
  console.log(`[orchestrator-seo] output_dir=${outDir}`);
  console.log(
    `[orchestrator-seo] keyword=${keyword} mock=${mockCompetitor} outline_only=${outlineOnly} wp_send=${wpSend}`
  );

  const kenPrimary = readKenPrimaryFromRun(outDir);
  const ytPublic = readPublicYoutubeFromRun(outDir);
  const orchestratorPrimary = mergeOrchestratorPrimaryBlocks(ytPublic, kenPrimary);

  if (ytPublic) {
    console.log(
      `[orchestrator-seo] public_youtube_context.txt: ${ytPublic.length} chars`
    );
  }
  if (kenPrimary) {
    console.log(
      `[orchestrator-seo] ken_primary_context.txt: ${kenPrimary.length} chars`
    );
  }
  if (orchestratorPrimary && !ytPublic && kenPrimary) {
    console.log(
      `[orchestrator-seo] orchestrator_primary merged: ${orchestratorPrimary.length} chars (ken only)`
    );
  } else if (orchestratorPrimary && ytPublic) {
    console.log(
      `[orchestrator-seo] orchestrator_primary merged: ${orchestratorPrimary.length} chars (youtube+ken)`
    );
  }

  const staged = await runSeoGenerationStages({
    outDir,
    keyword,
    mockCompetitor,
    outlineOnly,
  });

  writeFileSync(
    resolve(outDir, "competitor_research.json"),
    JSON.stringify(staged.research, null, 2) + "\n",
    "utf-8"
  );
  writeFileSync(
    resolve(outDir, "outline_v2.json"),
    JSON.stringify(
      {
        outline: staged.finalOutline,
        checkResult: staged.checkResult,
        wasFixed: staged.wasFixed,
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  if ("outlineOnly" in staged && staged.outlineOnly) {
    writeFileSync(
      resolve(outDir, "manifest.json"),
      JSON.stringify(
        {
          ok: true,
          phase: "outline_only",
          keyword,
          mockCompetitor,
          ken_primary_context: !!kenPrimary,
          public_youtube_context: !!ytPublic,
        },
        null,
        2
      ) + "\n",
      "utf-8"
    );
    console.log("[orchestrator-seo] done (outline-only).");
    return;
  }

  const full = staged as Exclude<
    Awaited<ReturnType<typeof runSeoGenerationStages>>,
    { outlineOnly: true }
  >;

  const slug = full.slug ?? simpleSlug(keyword);
  const displayTitle =
    full.displayTitle || full.finalOutline.title || full.article.title;

  const wpLocal = wpArticlePayload({
    title: displayTitle,
    htmlContent: full.article.htmlContent,
    metaDescription:
      full.finalOutline.metaDescription || full.article.metaDescription,
    keyword,
    slug,
  });

  writeFileSync(
    resolve(outDir, "article.json"),
    JSON.stringify(full.article, null, 2) + "\n",
    "utf-8"
  );
  writeFileSync(
    resolve(outDir, "wp_payload.json"),
    JSON.stringify(wpLocal, null, 2) + "\n",
    "utf-8"
  );

  let wpResponse: { link: string; id: number } | null = null;
  if (wpSend) {
    assertNoBannedWords(wpLocal.htmlContent, "orchestrator-seo-one-shot:wp-send");
    wpResponse = await wordPressCreatePostMin({
      title: wpLocal.title,
      content: wpLocal.htmlContent,
      status: "draft",
      slug: wpLocal.slug,
    });
    writeFileSync(
      resolve(outDir, "wp_response.json"),
      JSON.stringify(wpResponse, null, 2) + "\n",
      "utf-8"
    );
  }

  writeFileSync(
    resolve(outDir, "manifest.json"),
    JSON.stringify(
      {
        ok: true,
        phase: "full",
        keyword,
        mockCompetitor,
        wpSend,
        wpPosted: !!wpResponse,
        ken_primary_context: !!kenPrimary,
        public_youtube_context: !!ytPublic,
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  console.log("[orchestrator-seo] done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
