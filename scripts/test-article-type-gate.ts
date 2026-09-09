import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const GATE = resolve(REPO_ROOT, 'scripts', 'article-type-gate.ts');

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface RunOptions {
  target?: Record<string, unknown>;
  history?: Record<string, unknown>[];
  source?: string;
  maxConsecutive?: number;
}

function run(options: RunOptions = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'article-type-test-'));
  const targetDirectory = resolve(directory, 'target');
  const historyDirectory = resolve(directory, 'history');
  mkdirSync(targetDirectory);
  mkdirSync(historyDirectory);
  const source = options.source ?? '# 根拠\n\n[E1] 検索意図と制度上の論点を記録。\n';
  const sourcePath = resolve(targetDirectory, 'evidence_pack.md');
  const targetPath = resolve(targetDirectory, 'meta.yaml');
  const target = options.target ?? {
    slug: 'target',
    keyword: '法人の資金計画',
    created_at: '2026-09-09T10:00:00+09:00',
    article_type: '比較・判断型',
    article_type_source: {
      path: 'evidence_pack.md',
      sha256: createHash('sha256').update(source, 'utf8').digest('hex'),
      basis: 'both',
      rationale: '比較条件を求める検索意図と、複数の判断軸を含む根拠に基づく。',
    },
  };
  writeFileSync(sourcePath, source, 'utf8');
  writeFileSync(targetPath, yaml.dump(target), 'utf8');
  for (const [index, item] of (options.history ?? []).entries()) {
    const itemDirectory = resolve(historyDirectory, String(index));
    mkdirSync(itemDirectory);
    writeFileSync(resolve(itemDirectory, 'meta.yaml'), yaml.dump(item), 'utf8');
  }
  try {
    return spawnSync(
      process.execPath,
      [
        '--import', 'tsx', GATE, targetPath,
        '--source', sourcePath,
        '--history', historyDirectory,
        '--max-consecutive', String(options.maxConsecutive ?? 2),
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function history(slug: string, createdAt: string, articleType: string): Record<string, unknown> {
  return { slug, created_at: createdAt, article_type: articleType };
}

function validSourceAndDiversityPass(): void {
  const result = run({ history: [history('one', '2026-09-07T10:00:00+09:00', '解説型')] });
  check(result.status === 0, `valid metadata must pass: ${result.stderr}`);
  const output = JSON.parse(result.stdout) as { verdict: string; consecutiveCount: number };
  check(output.verdict === 'pass' && output.consecutiveCount === 1, 'valid output is incorrect');
  console.log('PASS source-enforced metadata');
}

function invalidOrMissingTypeFails(): void {
  for (const articleType of [undefined, 'ランキング型']) {
    const target: Record<string, unknown> = {
      slug: 'target', created_at: '2026-09-09T10:00:00+09:00', article_type: articleType,
      article_type_source: { path: 'evidence_pack.md', sha256: '0'.repeat(64), basis: 'both', rationale: '根拠' },
    };
    const result = run({ target });
    check(result.status === 2, `invalid type ${articleType} must exit 2`);
  }
  console.log('PASS article_type allowlist and requiredness');
}

function changedSourceFails(): void {
  const result = run({
    target: {
      slug: 'target', created_at: '2026-09-09T10:00:00+09:00', article_type: '解説型',
      article_type_source: { path: 'evidence_pack.md', sha256: '0'.repeat(64), basis: 'evidence_pack', rationale: '根拠' },
    },
  });
  check(result.status === 2 && result.stderr.includes('does not match --source'), 'changed source must fail closed');
  console.log('PASS source digest mismatch');
}

function consecutiveTypeFails(): void {
  const result = run({
    history: [
      history('one', '2026-09-07T10:00:00+09:00', '比較・判断型'),
      history('two', '2026-09-08T10:00:00+09:00', '比較・判断型'),
    ],
  });
  check(result.status === 2 && result.stderr.includes('exceed max consecutive'), 'third consecutive type must fail');
  console.log('PASS consecutive article type cap');
}

function differentTypeAvoidsOverDetection(): void {
  const result = run({
    history: [
      history('one', '2026-09-07T10:00:00+09:00', '比較・判断型'),
      history('two', '2026-09-08T10:00:00+09:00', '解説型'),
    ],
  });
  check(result.status === 0, `non-consecutive reuse must pass: ${result.stderr}`);
  console.log('PASS non-consecutive reuse');
}

function incompleteHistoryFailsClosed(): void {
  const result = run({ history: [{ slug: 'one', created_at: '2026-09-08T10:00:00+09:00' }] });
  check(result.status === 2 && result.stderr.includes('article_type is required'), 'incomplete history must fail');
  console.log('PASS incomplete history fail-closed');
}

function duplicateHistoryProvenanceFails(): void {
  const result = run({
    history: [
      history('same', '2026-09-07T10:00:00+09:00', '解説型'),
      history('same', '2026-09-08T10:00:00+09:00', '手順型'),
    ],
  });
  check(result.status === 2 && result.stderr.includes('duplicate slug or created_at'), 'duplicate history must fail');
  console.log('PASS duplicate history provenance');
}

function oversizedSourceFailsClosed(): void {
  const result = run({ source: 'x'.repeat(2 * 1024 * 1024 + 1) });
  check(result.status === 2 && result.stderr.includes('no larger than'), 'oversized source must fail');
  console.log('PASS oversized source fail-closed');
}

try {
  validSourceAndDiversityPass();
  invalidOrMissingTypeFails();
  changedSourceFails();
  consecutiveTypeFails();
  differentTypeAvoidsOverDetection();
  incompleteHistoryFailsClosed();
  duplicateHistoryProvenanceFails();
  oversizedSourceFailsClosed();
  console.log('ALL PASS');
} catch (error) {
  console.error(`FAIL article type tests: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
