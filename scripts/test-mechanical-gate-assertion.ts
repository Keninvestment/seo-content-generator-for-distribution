import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Violation {
  rule: string;
  severity: string;
  evidence: string;
}

interface GateResult {
  violations: Violation[];
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MECHANICAL_GATE = resolve(REPO_ROOT, 'scripts', 'mechanical-gate.ts');

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runGate(article: string): GateResult {
  const dir = mkdtempSync(resolve(tmpdir(), 'mechanical-gate-assertion-'));
  try {
    writeFileSync(resolve(dir, 'article_final.md'), article, 'utf8');
    const run = spawnSync(process.execPath, ['--import', 'tsx', MECHANICAL_GATE, dir], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    check(!run.error, `mechanical gate failed to start: ${run.error?.message}`);
    check(
      run.status === 0 || run.status === 1,
      `mechanical gate exited ${run.status}: ${run.stderr.trim()}`,
    );

    const parsed = JSON.parse(run.stdout) as Partial<GateResult>;
    check(Array.isArray(parsed.violations), 'mechanical gate output has no violations array');
    return parsed as GateResult;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertionViolations(result: GateResult): Violation[] {
  return result.violations.filter((violation) => violation.rule === 'assertion-banned');
}

function runQualifiedSentenceTests(): void {
  const qualifiedSentences = [
    ['場合', '一定の基準を満たす場合、節税できる。'],
    ['ケース', '事業利用が認められるケースでは、家賃を経費にできる。'],
    ['条件', '一定の条件を満たすと、節税できる。'],
    ['要件', '適用要件を満たすと、家賃を経費にできる。'],
    ['限り', '制度の適用が続く限り、節税できる。'],
    ['とは限らない', 'この方法で節税できるとは限らない。'],
    ['とは限りません', '家賃を経費にできるとは限りません。'],
    ['わけではない', 'この方法で節税できるわけではない。'],
    ['わけではありません', '家賃を経費にできるわけではありません。'],
    ['可能性', '運用次第で節税できる可能性がある。'],
    ['なら', '法人契約なら家賃を経費にできる。'],
    ['れば', '制度を利用すれば節税できる。'],
    ['かどうか', '家賃を経費にできるかどうかは用途による。'],
    ['でしょうか', 'この方法で節税できるでしょうか。'],
    ['文末できない', 'この方法で節税できると断定できない。'],
    ['文末できません', '家賃を経費にできると断定できません。'],
  ] as const;
  const article = qualifiedSentences.map(([, sentence]) => sentence).join('\n');
  const violations = assertionViolations(runGate(article));
  check(
    violations.length === 0,
    `qualified sentences must have 0 assertion violations: ${violations
      .map((violation) => violation.evidence)
      .join(' | ')}`,
  );

  for (const [qualifier, sentence] of qualifiedSentences) {
    check(sentence.includes(qualifier.replace(/^文末/, '')), `invalid test case: ${qualifier}`);
  }

  console.log(`PASS qualified sentence tests (${qualifiedSentences.length} cases)`);
}

function runBareAssertionTests(): void {
  const article = [
    '条件を確認します。この方法で節税できる。',
    '家賃は経費にできる。場合によって扱いが異なります。',
    '設備費を経費化できる。',
    '要件を確認してください。法人化で節税できる。',
  ].join('\n');
  const violations = assertionViolations(runGate(article));
  check(
    violations.length === 4,
    `4 bare assertions must be detected, got ${violations.length}: ${violations
      .map((violation) => violation.evidence)
      .join(' | ')}`,
  );
  check(
    violations.every((violation) => violation.severity === 'major'),
    'all bare assertions must have major severity',
  );

  console.log('PASS bare assertion tests (4 cases)');
}

function runUnconditionalPatternTests(): void {
  const article = [
    '場合によって評価額が下がる。',
    '条件を満たすと損益通算の範囲が広がる。',
    '要件を満たせば信用力が上がる。',
  ].join('\n');
  const violations = assertionViolations(runGate(article));
  check(
    violations.length === 3,
    `unconditional patterns must remain detected, got ${violations.length}`,
  );
  check(
    violations.every((violation) => violation.severity === 'major'),
    'all unconditional patterns must have major severity',
  );

  console.log('PASS unconditional pattern regression tests (3 cases)');
}

try {
  runQualifiedSentenceTests();
  runBareAssertionTests();
  runUnconditionalPatternTests();
  console.log('ALL PASS');
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL mechanical gate assertion tests: ${message}`);
  process.exitCode = 1;
}
