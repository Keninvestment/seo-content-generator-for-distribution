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
  const dir = mkdtempSync(resolve(tmpdir(), 'paragraph-rhythm-gate-'));
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

function rhythmViolations(article: string): Violation[] {
  return runGate(article).violations.filter((violation) => violation.rule === 'paragraph-rhythm');
}

function sentence(length: number, ending: string): string {
  return `${'あ'.repeat(length - 1)}${ending}`;
}

function expectPass(name: string, article: string): void {
  const violations = rhythmViolations(article);
  check(
    violations.length === 0,
    `${name} must pass: ${violations.map((violation) => violation.evidence).join(' | ')}`,
  );
  console.log(`PASS ${name}`);
}

function expectFail(
  name: string,
  article: string,
  expectedChars: number,
  expectedSentences: number,
): void {
  const violations = rhythmViolations(article);
  check(violations.length === 1, `${name} must have exactly 1 paragraph-rhythm violation`);
  const [violation] = violations;
  check(violation.severity === 'major', `${name} must have major severity`);
  check(
    violation.evidence.startsWith('article_final.md:1 '),
    `${name} evidence must include the paragraph start line: ${violation.evidence}`,
  );
  check(
    violation.evidence.includes(`chars=${expectedChars}`) &&
      violation.evidence.includes(`sentences=${expectedSentences}`),
    `${name} evidence must include chars/sentences: ${violation.evidence}`,
  );
  console.log(`PASS ${name}`);
}

try {
  expectFail(
    '3 sentences / 120 chars',
    [sentence(40, '。'), sentence(40, '！'), sentence(40, '？')].join(''),
    120,
    3,
  );
  expectFail(
    '2 sentences / 130 chars',
    [sentence(65, '。'), sentence(65, '。')].join(''),
    130,
    2,
  );
  expectPass(
    '2 sentences / 110 chars',
    [sentence(55, '。'), sentence(55, '。')].join(''),
  );
  expectPass('single sentence / 300 chars without punctuation', 'あ'.repeat(300));

  const longExcludedLine = 'あ'.repeat(160);
  expectPass(
    'headings, lists, and tables are excluded',
    [
      `# ${longExcludedLine}。${longExcludedLine}。${longExcludedLine}。`,
      '',
      `- ${longExcludedLine}。${longExcludedLine}。${longExcludedLine}。`,
      '',
      `| ${longExcludedLine}。${longExcludedLine}。${longExcludedLine}。 |`,
    ].join('\n'),
  );

  const longUrl = `https://example.com/${'very-long-url-'.repeat(12)}`;
  expectPass(
    'markdown link URL is excluded from character count',
    `${sentence(45, '。')}[短いテキスト](${longUrl})${sentence(45, '。')}`,
  );

  expectPass(
    'code fence content is excluded',
    ['```text', sentence(140, '。').repeat(3), '```'].join('\n'),
  );

  console.log('ALL PASS');
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL paragraph rhythm gate tests: ${message}`);
  process.exitCode = 1;
}
