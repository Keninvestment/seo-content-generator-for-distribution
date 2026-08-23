import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Violation {
  rule: string;
  severity: string;
  evidence: string;
  message: string;
}

interface GateResult {
  violations: Violation[];
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MECHANICAL_GATE = resolve(REPO_ROOT, 'scripts', 'mechanical-gate.ts');
const ABSOLUTE_PERCENTAGE_MESSAGE = '100%とする絶対的な数値表現です。';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runGate(article: string): GateResult {
  const dir = mkdtempSync(resolve(tmpdir(), 'mechanical-gate-unsupported-claims-'));
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

function absolutePercentageViolations(result: GateResult): Violation[] {
  return result.violations.filter(
    (violation) =>
      violation.rule === 'unsupported-claims' &&
      violation.message === ABSOLUTE_PERCENTAGE_MESSAGE,
  );
}

function runLegalTaxContextTests(): void {
  const legalTaxSentences = [
    '受取配当等の益金不算入では、完全子法人株式等（持株割合100%）は100%、関連法人株式等（持株割合1/3超100%未満）は区分が異なります。',
    '法令上の税率100%という記載は、適用要件と併せて確認します。',
    '控除率100%の区分は、根拠条文を確認します。',
  ];
  const violations = absolutePercentageViolations(runGate(legalTaxSentences.join('\n')));
  check(
    violations.length === 0,
    `legal/tax percentage sentences must have 0 absolute-percentage violations: ${violations
      .map((violation) => violation.evidence)
      .join(' | ')}`,
  );

  console.log(`PASS legal/tax context tests (${legalTaxSentences.length} cases)`);
}

function runBarePercentageTests(): void {
  const article = [
    '満足度100%を保証。',
    '税率を確認します。満足度100%を保証。控除の要件は別途確認します。',
  ].join('\n');
  const violations = absolutePercentageViolations(runGate(article));
  check(
    violations.length === 2,
    `2 bare percentage claims must be detected, got ${violations.length}: ${violations
      .map((violation) => violation.evidence)
      .join(' | ')}`,
  );
  check(
    violations.every((violation) => violation.severity === 'major'),
    'all bare percentage claims must have major severity',
  );
  check(
    violations.every(
      (violation) =>
        violation.message === ABSOLUTE_PERCENTAGE_MESSAGE &&
        violation.evidence.includes('article_final.md:') &&
        violation.evidence.includes('100%'),
    ),
    'bare percentage claims must preserve the original message and contextual evidence',
  );

  console.log('PASS bare percentage regression tests (2 cases)');
}

try {
  runLegalTaxContextTests();
  runBarePercentageTests();
  console.log('ALL PASS');
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL mechanical gate unsupported-claims tests: ${message}`);
  process.exitCode = 1;
}
