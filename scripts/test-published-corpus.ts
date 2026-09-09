import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = resolve(REPO_ROOT, 'scripts', 'similarity-gate.ts');

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function paragraph(seed: string, count = 50): string {
  return Array.from({ length: count }, (_, index) => `${seed}${index}を具体的に説明します。`).join('');
}

interface RunOptions {
  body?: string;
  mutate?: (inventory: Record<string, unknown>) => void;
}

function run(target: string, options: RunOptions = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'published-corpus-test-'));
  const corpus = resolve(directory, 'corpus');
  const targetPath = resolve(directory, 'target.md');
  const inventoryPath = resolve(directory, 'published.json');
  mkdirSync(corpus);
  const body = options.body ?? `<h2>別の論点</h2><p>${paragraph('海洋調査')}</p>`;
  const inventory: Record<string, unknown> = {
    schema_version: 1,
    synced_at: '2026-09-09T10:00:00+09:00',
    source: { site: 'https://ownersoffice.co.jp' },
    posts: [
      {
        id: 42,
        link: 'https://ownersoffice.co.jp/public-article/',
        modified: '2026-09-09T09:00:00+09:00',
        content_html: body,
        content_sha256: digest(body),
      },
    ],
  };
  options.mutate?.(inventory);
  writeFileSync(targetPath, target, 'utf8');
  writeFileSync(inventoryPath, JSON.stringify(inventory), 'utf8');
  try {
    return spawnSync(
      process.execPath,
      ['--import', 'tsx', GATE, targetPath, '--corpus', corpus, '--published-inventory', inventoryPath],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function publishedDuplicateIsCompared(): void {
  const shared = paragraph('公開済み記事にだけ存在する資金計画');
  const result = run(`# 対象\n\n## 計画の確認\n${shared}`, {
    body: `<h2>計画の確認</h2><p>${shared}</p>`,
  });
  check(result.status === 1, `published near duplicate must fail, got ${result.status}: ${result.stderr}`);
  const output = JSON.parse(result.stdout) as { corpusSize: number; results: { file: string }[] };
  check(output.corpusSize === 1, 'published body must be included in corpusSize');
  check(output.results[0].file.startsWith('published:42:https://ownersoffice.co.jp/'), 'safe provenance missing');
  check(!result.stdout.includes(shared), 'gate output must not disclose published body');
  console.log('PASS published body comparison');
}

function unrelatedPublishedArticlePasses(): void {
  const result = run(`# 対象\n\n## 採用条件\n${paragraph('採用面接の評価基準')}`);
  check(result.status === 0, `unrelated published article must pass: ${result.stderr}`);
  console.log('PASS unrelated published body');
}

function missingBodyFailsClosed(): void {
  const result = run('# 対象\n本文', {
    mutate: (inventory) => {
      const posts = inventory.posts as Record<string, unknown>[];
      delete posts[0].content_html;
    },
  });
  check(result.status === 2, `missing body must exit 2, got ${result.status}`);
  check(result.stderr.includes('content_html must contain'), 'missing body error is not explicit');
  console.log('PASS missing body fail-closed');
}

function duplicateProvenanceFailsClosed(): void {
  const result = run('# 対象\n本文', {
    mutate: (inventory) => {
      const posts = inventory.posts as Record<string, unknown>[];
      posts.push({ ...posts[0], link: 'https://ownersoffice.co.jp/duplicate-id/' });
    },
  });
  check(result.status === 2, `duplicate provenance must exit 2, got ${result.status}`);
  check(result.stderr.includes('duplicates published provenance'), 'duplicate provenance error missing');
  console.log('PASS duplicate provenance fail-closed');
}

function changedBodyFailsClosed(): void {
  const result = run('# 対象\n本文', {
    mutate: (inventory) => {
      const posts = inventory.posts as Record<string, unknown>[];
      posts[0].content_sha256 = '0'.repeat(64);
    },
  });
  check(result.status === 2, `body digest mismatch must exit 2, got ${result.status}`);
  check(result.stderr.includes('does not match content_html'), 'body digest mismatch error missing');
  console.log('PASS published body digest fail-closed');
}

function unsafeUrlFailsClosed(): void {
  const result = run('# 対象\n本文', {
    mutate: (inventory) => {
      const posts = inventory.posts as Record<string, unknown>[];
      posts[0].link = 'https://ownersoffice.co.jp/post/?token=secret';
    },
  });
  check(result.status === 2, `URL with query must exit 2, got ${result.status}`);
  check(!result.stderr.includes('secret'), 'error output must not disclose URL query values');
  console.log('PASS privacy-safe URL provenance');
}

function oversizedBodyFailsClosed(): void {
  const body = 'あ'.repeat(2 * 1024 * 1024);
  const result = run('# 対象\n本文', { body });
  check(result.status === 2, `oversized body must exit 2, got ${result.status}`);
  check(result.stderr.includes('content_html exceeds'), 'oversized body error missing');
  console.log('PASS oversized body fail-closed');
}

try {
  publishedDuplicateIsCompared();
  unrelatedPublishedArticlePasses();
  missingBodyFailsClosed();
  duplicateProvenanceFailsClosed();
  changedBodyFailsClosed();
  unsafeUrlFailsClosed();
  oversizedBodyFailsClosed();
  console.log('ALL PASS');
} catch (error) {
  console.error(`FAIL published corpus tests: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
