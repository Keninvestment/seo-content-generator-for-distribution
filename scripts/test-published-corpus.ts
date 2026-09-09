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

function inlineTagsPreserveVisibleText(): void {
  const visible = paragraph('同一の公開本文でインライン装飾を確認');
  const tagged = Array.from(visible)
    .map((character, index) => (index % 4 === 0 ? `<strong>${character}</strong>` : character))
    .join('');
  const result = run(`# 対象\n\n## 装飾の確認\n${visible}`, {
    body: `<h2>装飾の確認</h2><p>${tagged}</p>`,
  });
  check(result.status === 1, `inline-tagged identical text must fail similarity: ${result.stderr}`);
  const output = JSON.parse(result.stdout) as { results: { shingleSim: number }[] };
  check(output.results[0].shingleSim === 1, `inline tags changed visible shingles: ${output.results[0].shingleSim}`);
  console.log('PASS inline tags preserve text adjacency');
}

function hiddenAttributeTextIsIgnored(): void {
  const visible = paragraph('属性値を除外して比較する公開本文');
  const hidden = paragraph('画面に表示されない属性内の文字列', 80);
  const result = run(`# 対象\n\n## 属性の確認\n${visible}`, {
    body: `<h2 data-label=">見出しではない">属性の確認</h2><p title=">${hidden}">${visible}</p>`,
  });
  check(result.status === 1, `hidden attribute text must not evade similarity: ${result.stderr}`);
  const output = JSON.parse(result.stdout) as { results: { shingleSim: number }[] };
  check(output.results[0].shingleSim === 1, `attribute text contaminated shingles: ${output.results[0].shingleSim}`);
  console.log('PASS hidden attribute text is ignored');
}

function literalLessThanIsPreserved(): void {
  const shared = paragraph('a < bと1 < 2を含む同一の公開本文');
  const result = run(`# 対象\n\n## 不等号の確認\n${shared}`, {
    body: `<h2>不等号の確認</h2><p>${shared}</p>`,
  });
  check(result.status === 1, `literal less-than text must not evade similarity: ${result.stderr}`);
  const output = JSON.parse(result.stdout) as { results: { shingleSim: number }[] };
  check(output.results[0].shingleSim === 1, `literal less-than changed shingles: ${output.results[0].shingleSim}`);
  console.log('PASS literal less-than text is preserved');
}

function nestedTemplateTextIsIgnored(): void {
  const shared = paragraph('入れ子template外の公開本文');
  const hidden = paragraph('画面に表示されないtemplate内の文字列', 200);
  const result = run(`# 対象\n\n## 本文の確認\n${shared}`, {
    body: `<h2>本文の確認</h2><p>${shared}</p><template><template>hidden</template>${hidden}</template>`,
  });
  check(result.status === 1, `nested template text must not evade similarity: ${result.stderr}`);
  const output = JSON.parse(result.stdout) as { results: { shingleSim: number }[] };
  check(output.results[0].shingleSim === 1, `nested template contaminated shingles: ${output.results[0].shingleSim}`);
  console.log('PASS nested template text is ignored');
}

function templateScriptTextIsIgnored(): void {
  const shared = paragraph('template外にある同一の公開本文', 70);
  const hidden = paragraph('script後のtemplate内部だけにある非表示文字列', 2_000);
  const result = run(`# 対象\n\n${shared}`, {
    body: `<p>${shared}</p><template><script>const x="</template>";</script>${hidden}</template>`,
  });
  check(result.status === 1, `script text must not terminate hidden template content: ${result.stderr}`);
  const output = JSON.parse(result.stdout) as { results: { shingleSim: number }[] };
  check(output.results[0].shingleSim === 1, `template script text contaminated shingles: ${output.results[0].shingleSim}`);
  console.log('PASS template script raw text is ignored');
}

function literalLessThanRunIsBounded(): void {
  const shared = paragraph('大量のliteral less-than後にある公開本文', 70);
  const body = `${'<'.repeat(80_000)}><p>${shared}</p>`;
  const startedAt = Date.now();
  const result = run(`# 対象\n\n${'<'.repeat(80_000)}>${shared}`, { body });
  const elapsed = Date.now() - startedAt;
  check(result.status === 1, `literal less-than run must preserve similarity: ${result.stderr}`);
  check(elapsed < 5000, `literal less-than normalization exceeded 5s: ${elapsed}ms`);
  console.log(`PASS literal less-than run bounded (${elapsed}ms)`);
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

function emptyPublishedInventoryFailsClosed(): void {
  const result = run('# 対象\n本文', {
    mutate: (inventory) => {
      inventory.posts = [];
    },
  });
  check(result.status === 2, `empty published inventory must exit 2, got ${result.status}`);
  check(result.stderr.includes('posts must not be empty'), 'empty inventory error missing');
  console.log('PASS empty published inventory fail-closed');
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

function nonContentBodyFailsClosed(): void {
  for (const body of [
    `<!--${'comment'.repeat(100)}-->`,
    `<script>${'privateScriptData'.repeat(100)}</script>`,
  ]) {
    const result = run('# 対象\n本文', { body });
    check(result.status === 2, `non-content body must exit 2, got ${result.status}`);
    check(result.stderr.includes('insufficient comparison text'), 'non-content body error missing');
  }
  console.log('PASS non-content body fail-closed');
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

function nonCanonicalHostFailsClosed(): void {
  for (const site of ['https://127.0.0.1', 'https://localhost', 'https://10.0.0.1']) {
    const result = run('# 対象\n本文', {
      mutate: (inventory) => {
        inventory.source = { site };
        const posts = inventory.posts as Record<string, unknown>[];
        posts[0].link = `${site}/private/`;
      },
    });
    check(result.status === 2, `non-canonical host ${site} must exit 2`);
    check(result.stderr.includes('canonical published origin'), 'canonical origin error missing');
  }
  console.log('PASS private and loopback hosts fail-closed');
}

function unclosedRawTagIsBounded(): void {
  const body = '<script>'.repeat(Math.floor((1.5 * 1024 * 1024) / 8));
  const startedAt = Date.now();
  const result = run('# 対象\n本文', { body });
  const elapsed = Date.now() - startedAt;
  check(result.status === 2, `unclosed script corpus must exit 2, got ${result.status}`);
  check(result.stderr.includes('insufficient comparison text'), 'unclosed script error missing');
  check(elapsed < 5000, `unclosed script normalization exceeded 5s: ${elapsed}ms`);
  console.log(`PASS unclosed raw tag bounded (${elapsed}ms)`);
}

function unclosedQuotedTagIsRejected(): void {
  const body = `<p title="${'nonVisibleAttribute'.repeat(50_000)}`;
  const startedAt = Date.now();
  const result = run('# 対象\n本文', { body });
  const elapsed = Date.now() - startedAt;
  check(result.status === 2, `unclosed quoted tag must exit 2, got ${result.status}`);
  check(result.stderr.includes('insufficient comparison text'), 'unclosed quoted tag error missing');
  check(elapsed < 5000, `unclosed quoted tag scan exceeded 5s: ${elapsed}ms`);
  console.log(`PASS unclosed quoted tag rejected (${elapsed}ms)`);
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
  inlineTagsPreserveVisibleText();
  hiddenAttributeTextIsIgnored();
  literalLessThanIsPreserved();
  nestedTemplateTextIsIgnored();
  templateScriptTextIsIgnored();
  literalLessThanRunIsBounded();
  unrelatedPublishedArticlePasses();
  emptyPublishedInventoryFailsClosed();
  missingBodyFailsClosed();
  duplicateProvenanceFailsClosed();
  changedBodyFailsClosed();
  nonContentBodyFailsClosed();
  unsafeUrlFailsClosed();
  nonCanonicalHostFailsClosed();
  unclosedRawTagIsBounded();
  unclosedQuotedTagIsRejected();
  oversizedBodyFailsClosed();
  console.log('ALL PASS');
} catch (error) {
  console.error(`FAIL published corpus tests: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
