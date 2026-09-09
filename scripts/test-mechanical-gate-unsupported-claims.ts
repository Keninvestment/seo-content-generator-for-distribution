import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const message = '100%とする絶対的な数値表現です。';
const cases: [string, number][] = [
  ['受取配当等の益金不算入では、完全子法人株式等（持株割合100%）は100%、関連法人株式等（持株割合1/3超100%未満）は区分が異なります。', 0],
  ['法令上の税率100%という記載は、適用要件と併せて確認します。', 0],
  ['控除率100%の区分は根拠条文を確認します。', 0],
  ['益金不算入 100%の区分です。', 0],
  ['持株割合は **100%** です。', 0],
  ['完全子法人株式等は100%です。', 0],
  ['満足度100%を保証。', 1],
  ['税率を確認します。満足度100%を保証。控除の要件は別途確認します。', 1],
  ['税率を説明し、満足度100%を保証します。', 1],
  ['満足度100%を保証し、税率も確認します。', 1],
  ['控除率100%の制度があり、満足度100%を保証します。', 1],
  ['完全子法人株式等（持株割合100%）は100%、当社の成功率100%です。', 1],
  ['持株割合100%でも、当社なら100%成功します。', 1],
  ['税率\n100%の満足度です。', 1],
  ['税率。100%の満足度です。', 1],
  ['控除を100%保証します。', 1],
  ['控除率100%を保証します。', 1],
  ['控除率**100%**を保証します。', 1],
  ['控除率100%の適用を保証します。', 1],
  ['税率を確認！成功率100%です。', 1],
  ['持株割合100%の会社でも満足度100%、成功率100%とは限りません。', 2],
];

const dir = mkdtempSync(resolve(tmpdir(), 'gate-3555-'));
try {
  // One article per case avoids a legal marker in another fixture masking a failure.
  for (const [article, expected] of cases) {
    writeFileSync(resolve(dir, 'article_final.md'), article, 'utf8');
    const run = spawnSync(process.execPath, ['--import', 'tsx', resolve(root, 'scripts/mechanical-gate.ts'), dir], {
      cwd: root, encoding: 'utf8', timeout: 30_000,
    });
    if (run.error || ![0, 1].includes(run.status ?? -1)) throw new Error(`CLI failed: ${run.error ?? run.stderr}`);
    const result = JSON.parse(run.stdout) as { violations: { rule: string; message: string; severity: string; evidence: string }[] };
    const matches = result.violations.filter(v => v.rule === 'unsupported-claims' && v.message === message);
    if (matches.length !== expected) throw new Error(`${article}: expected ${expected}, got ${matches.length}`);
    if (matches.some(v => v.severity !== 'major' || !v.evidence.includes('article_final.md:') || !v.evidence.includes('100%'))) {
      throw new Error(`Violation metadata changed: ${article}`);
    }
  }
  // Other unsupported-claim patterns retain their severity even in tax context.
  writeFileSync(resolve(dir, 'article_final.md'), '税率100%でも必ず節税できます。控除では業界初です。', 'utf8');
  const run = spawnSync(process.execPath, ['--import', 'tsx', resolve(root, 'scripts/mechanical-gate.ts'), dir], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (run.error || ![0, 1].includes(run.status ?? -1)) throw new Error('CLI regression probe failed');
  const remaining = JSON.parse(run.stdout).violations.filter((v: { rule: string }) => v.rule === 'unsupported-claims');
  if (remaining.length !== 2) throw new Error('Other unsupported claims were weakened');
  console.log(`PASS ${cases.length} percentage cases and sibling-rule regression`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
