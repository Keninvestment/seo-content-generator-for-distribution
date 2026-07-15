import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface SimilarityResult {
  file: string;
  headingSim: number;
  shingleSim: number;
}

interface GateResult {
  verdict: 'pass' | 'fail';
  target: string;
  corpusSize: number;
  thresholds: { heading: number; shingle: number };
  results: SimilarityResult[];
}

interface GateRun {
  status: number;
  result: GateResult;
  stderr: string;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIMILARITY_GATE = resolve(REPO_ROOT, 'scripts', 'similarity-gate.ts');

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function paragraph(seed: string, count = 45): string {
  return Array.from({ length: count }, (_, index) => `${seed}${index}について具体的に説明します。`).join('');
}

function runGate(targetArticle: string, corpusArticles: Record<string, string>): GateRun {
  const directory = mkdtempSync(resolve(tmpdir(), 'similarity-gate-test-'));
  const corpusDirectory = resolve(directory, 'corpus');
  const targetFile = resolve(directory, 'target.md');
  mkdirSync(corpusDirectory);

  try {
    writeFileSync(targetFile, targetArticle, 'utf8');
    for (const [relativePath, content] of Object.entries(corpusArticles)) {
      const file = resolve(corpusDirectory, relativePath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content, 'utf8');
    }

    const run = spawnSync(
      process.execPath,
      ['--import', 'tsx', SIMILARITY_GATE, targetFile, '--corpus', corpusDirectory],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    check(!run.error, `similarity gate failed to start: ${run.error?.message}`);
    check(
      run.status === 0 || run.status === 1,
      `similarity gate exited ${run.status}: ${run.stderr.trim()}`,
    );

    const parsed = JSON.parse(run.stdout) as Partial<GateResult>;
    check(parsed.verdict === 'pass' || parsed.verdict === 'fail', 'gate output has no verdict');
    check(typeof parsed.corpusSize === 'number', 'gate output has no corpusSize');
    check(Array.isArray(parsed.results), 'gate output has no results array');
    return { status: run.status, result: parsed as GateResult, stderr: run.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function nearDuplicateTest(): void {
  const shared = paragraph('法人向け資金計画の実務ポイント');
  const target = `# 資金計画ガイド\n\n## 現状を把握する\n${shared}\n\n## 計画を立てる\n${shared}\n\n### 数値を確認する\n${shared}`;
  const existing = `# 資金計画の解説\n\n## 現状を把握する\n${shared}\n\n## 計画を立てる\n${shared}\n\n### 数値を確認する\n${shared.slice(0, Math.floor(shared.length * 0.9))}別の補足です。`;
  const run = runGate(target, { 'nested/article_existing.md': existing });

  check(run.status === 1, `near duplicate must exit 1, got ${run.status}`);
  check(run.result.verdict === 'fail', 'near duplicate must fail');
  check(run.result.results[0]?.shingleSim >= 0.25, 'near duplicate must exceed shingle threshold');
  console.log('PASS near duplicate test');
}

function headingStructureTest(): void {
  const target = [
    '# 法人保険の基礎',
    '## 導入前に確認すること',
    paragraph('契約条件と保障内容', 20),
    '### 費用を整理する',
    paragraph('保険料と解約返戻金', 20),
    '## 導入後の管理',
    paragraph('定期的な契約管理', 20),
  ].join('\n\n');
  const existing = [
    '# 採用サイトの作り方',
    '## 導入前に確認すること',
    paragraph('応募者が閲覧する写真素材', 20),
    '### 費用を整理する',
    paragraph('撮影費用と求人広告予算', 20),
    '## 導入後の管理',
    paragraph('募集要項の定期更新', 20),
  ].join('\n\n');
  const run = runGate(target, { 'article_structure.md': existing });

  check(run.status === 1, `same headings must exit 1, got ${run.status}`);
  check(run.result.verdict === 'fail', 'same headings must fail');
  check(run.result.results[0]?.headingSim === 1, 'same normalized headings must have headingSim=1');
  check(run.result.results[0]?.shingleSim < 0.25, 'different bodies must remain below shingle threshold');
  console.log('PASS heading structure test');
}

function unrelatedArticlesTest(): void {
  const target = [
    '# オフィス移転の手順',
    '## 移転候補地を比較する',
    paragraph('駅からの動線や賃料条件を調査', 24),
    '## 内装工事を手配する',
    paragraph('会議室の配置と工事日程を調整', 24),
  ].join('\n\n');
  const existing = [
    '# 家庭菜園の楽しみ方',
    '## 季節に合う種を選ぶ',
    paragraph('日照時間に合わせた野菜の品種選び', 24),
    '## 毎朝の水やりを続ける',
    paragraph('土の乾き具合を観察した水分補給', 24),
  ].join('\n\n');
  const run = runGate(target, { 'article_gardening.md': existing });

  check(run.status === 0, `unrelated articles must exit 0, got ${run.status}`);
  check(run.result.verdict === 'pass', 'unrelated articles must pass');
  check(run.result.corpusSize === 1, `expected corpusSize=1, got ${run.result.corpusSize}`);
  check(run.stderr.includes('[similarity-gate] PASS worst='), 'pass summary must be written to stderr');
  console.log('PASS unrelated articles test');
}

function emptyCorpusTest(): void {
  const run = runGate('# 新しい記事\n\n## 最初の見出し\n新規サイトの記事です。', {});

  check(run.status === 0, `empty corpus must exit 0, got ${run.status}`);
  check(run.result.verdict === 'pass', 'empty corpus must pass');
  check(run.result.corpusSize === 0, `expected corpusSize=0, got ${run.result.corpusSize}`);
  check(run.result.results.length === 0, 'empty corpus must have no results');
  console.log('PASS empty corpus test');
}

function corpusSelectionTest(): void {
  const target = '# 航空機整備の記録\n\n## 点検項目\nエンジン部品の状態を順番に記録します。';
  const longGenericArticle = `# 海洋観測の記録\n\n## 潮流データ\n${paragraph('沖合の水温と潮流を計測', 35)}`;
  const excludedArticle = `## 点検項目\n${paragraph('エンジン部品の状態を順番に記録', 35)}`;
  const run = runGate(target, {
    'nested/article_short.md': '固有の短い記事です。',
    'nested/long-notes.md': longGenericArticle,
    'nested/short-notes.md': '500文字未満の一般Markdownです。',
    'evidence_pack.md': excludedArticle,
    'sol_review_v2.md': excludedArticle,
    'tax_qa_review_final.md': excludedArticle,
    'generation_prompt_draft.md': excludedArticle,
  });

  check(run.status === 0, `selected unrelated corpus must exit 0, got ${run.status}`);
  check(run.result.verdict === 'pass', 'excluded similar support files must not fail the gate');
  check(run.result.corpusSize === 2, `expected two eligible corpus files, got ${run.result.corpusSize}`);
  console.log('PASS corpus selection test');
}

try {
  nearDuplicateTest();
  headingStructureTest();
  unrelatedArticlesTest();
  emptyCorpusTest();
  corpusSelectionTest();
  console.log('ALL PASS');
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL similarity gate tests: ${message}`);
  process.exitCode = 1;
}
