import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type Severity = 'critical' | 'major';

type Rule =
  | 'placeholder'
  | 'generation-corruption'
  | 'promise-mismatch'
  | 'unsupported-claims'
  | 'assertion-banned'
  | 'length-shortfall'
  | 'structure-incomplete';

interface Violation {
  rule: Rule;
  severity: Severity;
  evidence: string;
  message: string;
}

interface GateResult {
  dir: string;
  verdict: 'pass' | 'fail';
  criticalCount: number;
  majorCount: number;
  violations: Violation[];
}

interface TextSource {
  file: string;
  line: number;
  text: string;
}

type JsonRecord = Record<string, unknown>;

const ARTICLE_FILE = 'article_final.md';

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

async function readOptionalJson(filePath: string): Promise<{ raw: string; value: unknown } | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return { raw, value: JSON.parse(raw) as unknown };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, Math.max(0, index)).split('\n').length;
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function contextEvidence(
  file: string,
  content: string,
  index: number,
  matchLength: number,
  radius = 30,
): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + matchLength + radius);
  return `${file}:${lineNumberAt(content, index)} ${compact(content.slice(start, end))}`;
}

function sourceEvidence(source: TextSource, matchedText?: string): string {
  return `${source.file}:${source.line} ${compact(matchedText ?? source.text)}`;
}

function markdownText(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*```[^\n]*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-+*]|\d+[.)])\s+/gm, '')
    .replace(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm, '')
    .replace(/[*_~`|]/g, '')
    .replace(/\s/g, '');
}

function findJsonKeyLine(raw: string, key: string): number {
  const lines = raw.split('\n');
  const index = lines.findIndex((line) => line.includes(`"${key}"`));
  return index >= 0 ? index + 1 : 1;
}

function collectPromiseSources(
  article: string,
  articleJson: { raw: string; value: unknown } | null,
): TextSource[] {
  const sources: TextSource[] = [];
  const lines = article.split('\n');
  const h1Index = lines.findIndex((line) => /^#\s+/.test(line));
  if (h1Index >= 0) {
    sources.push({
      file: ARTICLE_FILE,
      line: h1Index + 1,
      text: lines[h1Index].replace(/^#\s+/, '').trim(),
    });
  }

  const metaIndex = lines.slice(0, 10).findIndex((line) => /^>\s+/.test(line));
  if (metaIndex >= 0) {
    sources.push({
      file: ARTICLE_FILE,
      line: metaIndex + 1,
      text: lines[metaIndex].replace(/^>\s+/, '').trim(),
    });
  }

  const jsonObject = asRecord(articleJson?.value);
  if (jsonObject) {
    for (const key of ['title', 'metaDescription'] as const) {
      const value = jsonObject[key];
      if (typeof value === 'string' && value.trim()) {
        sources.push({
          file: 'article.json',
          line: findJsonKeyLine(articleJson?.raw ?? '', key),
          text: value,
        });
      }
    }
  }

  return sources;
}

function findSource(sources: TextSource[], pattern: RegExp): TextSource | null {
  return sources.find((source) => pattern.test(source.text)) ?? null;
}

function getTargetAverage(outlineJson: unknown): number | null {
  const root = asRecord(outlineJson);
  if (!root) return null;

  const candidates = [
    asRecord(root.characterCountAnalysis)?.average,
    asRecord(asRecord(root.outline)?.characterCountAnalysis)?.average,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return null;
}

function addPatternViolations(
  violations: Violation[],
  content: string,
  rule: Rule,
  severity: Severity,
  patterns: Array<{ pattern: RegExp; message: string }>,
  evidenceRadius = 30,
): void {
  const seen = new Set<string>();
  for (const { pattern, message } of patterns) {
    for (const match of content.matchAll(pattern)) {
      const index = match.index ?? 0;
      const key = `${rule}:${index}:${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        rule,
        severity,
        evidence: contextEvidence(ARTICLE_FILE, content, index, match[0].length, evidenceRadius),
        message,
      });
    }
  }
}

function checkPlaceholders(article: string, violations: Violation[]): void {
  addPatternViolations(violations, article, 'placeholder', 'critical', [
    { pattern: /\[中間見出し\]|【中間見出し】/g, message: '編集用の中間見出しプレースホルダーが残っています。' },
    { pattern: /\[見出し\]|【見出し】/g, message: '編集用の見出しプレースホルダーが残っています。' },
    { pattern: /\[TODO[^\]\n]*(?:\]|$)?/gim, message: 'TODOプレースホルダーが残っています。' },
    { pattern: /TODO\s*:/gi, message: 'TODOプレースホルダーが残っています。' },
    { pattern: /[（(]ここに/g, message: '差し込み位置を示すプレースホルダーが残っています。' },
    { pattern: /\bXXX\b|ＸＸＸ/gi, message: 'XXXプレースホルダーが残っています。' },
    { pattern: /(?:〇〇|○○)[（(]仮[）)]/g, message: '仮名プレースホルダーが残っています。' },
    { pattern: /\blorem(?:\s+ipsum)?\b/gi, message: 'loremプレースホルダーが残っています。' },
  ]);
}

function checkTables(article: string, violations: Violation[]): void {
  const lines = article.split('\n');
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trimStart().startsWith('|')) {
      index += 1;
      continue;
    }

    const start = index;
    const rows: Array<{ line: number; cells: number; text: string }> = [];
    while (index < lines.length && lines[index].trimStart().startsWith('|')) {
      const trimmed = lines[index].trim();
      const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
      rows.push({ line: index + 1, cells: inner.split('|').length, text: trimmed });
      index += 1;
    }

    const counts = new Set(rows.map((row) => row.cells));
    if (counts.size > 1) {
      const referenceRow = rows[0];
      const mismatchedRow = rows.find((row) => row.cells !== referenceRow.cells) ?? rows.at(-1) ?? referenceRow;
      violations.push({
        rule: 'generation-corruption',
        severity: 'critical',
        evidence: `${ARTICLE_FILE}:${referenceRow.line} ${compact(referenceRow.text)}（${referenceRow.cells}セル）; ${ARTICLE_FILE}:${mismatchedRow.line} ${compact(mismatchedRow.text)}（${mismatchedRow.cells}セル）`,
        message: '同一Markdown表内でセル数が一致していません。',
      });
    }
  }
}

function checkBracketPairs(article: string, violations: Violation[]): void {
  const pairs = [
    { open: '「', close: '」' },
    { open: '『', close: '』' },
    { open: '（', close: '）' },
  ];

  for (const pair of pairs) {
    const openCount = article.split(pair.open).length - 1;
    const closeCount = article.split(pair.close).length - 1;
    if (Math.abs(openCount - closeCount) < 2) continue;

    const firstIndex = Math.max(0, article.search(new RegExp(`[${pair.open}${pair.close}]`, 'u')));
    violations.push({
      rule: 'generation-corruption',
      severity: 'critical',
      evidence: contextEvidence(ARTICLE_FILE, article, firstIndex, 1),
      message: `${pair.open}${pair.close}の開閉数が不一致です（開き${openCount}、閉じ${closeCount}）。`,
    });
  }
}

function checkGenerationCorruption(article: string, violations: Violation[]): void {
  addPatternViolations(violations, article, 'generation-corruption', 'critical', [
    {
      pattern: /[ぁ-んァ-ン一-龥] of [ぁ-んァ-ン一-龥]/g,
      message: '日本語文中に英語の「of」が混入しています。',
    },
    {
      pattern: /(?<!も)のの|をを|にに/g,
      message: '同じ助詞が連続しています。',
    },
  ]);
  checkTables(article, violations);
  checkBracketPairs(article, violations);
}

function checkPromiseMismatch(
  article: string,
  sources: TextSource[],
  bodyLength: number,
  violations: Violation[],
): void {
  const lines = article.split('\n');
  const bodyHeadings = lines
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter((heading) => /^#{2,6}\s+/.test(heading.text));
  const listItemCount = lines.filter((line) => /^\s*(?:[-+*]|\d+[.)])\s+/.test(line)).length;

  const checklistSource = findSource(sources, /チェックリスト/);
  const hasChecklistHeading = bodyHeadings.some((heading) =>
    /チェックリスト|チェック項目|確認(?:リスト|項目|事項)/.test(heading.text),
  );
  if (checklistSource && !hasChecklistHeading && listItemCount < 10) {
    violations.push({
      rule: 'promise-mismatch',
      severity: 'critical',
      evidence: sourceEvidence(checklistSource),
      message: `チェックリストを約束していますが、対応見出しがなく、リスト項目も${listItemCount}件です。`,
    });
  }

  const faqSource = findSource(sources, /FAQ|よくある質問/i);
  const hasFaqHeading = bodyHeadings.some((heading) => /FAQ|よくある質問|よくあるご質問|Q\s*&\s*A/i.test(heading.text));
  if (faqSource && !hasFaqHeading) {
    violations.push({
      rule: 'promise-mismatch',
      severity: 'critical',
      evidence: sourceEvidence(faqSource),
      message: 'FAQまたはよくある質問を約束していますが、対応する本文見出しがありません。',
    });
  }

  const templateSource = findSource(sources, /テンプレート/);
  const hasTemplateHeading = bodyHeadings.some((heading) => /テンプレート|ひな形|雛形/.test(heading.text));
  if (templateSource && !hasTemplateHeading) {
    violations.push({
      rule: 'promise-mismatch',
      severity: 'critical',
      evidence: sourceEvidence(templateSource),
      message: 'テンプレートを約束していますが、対応する本文見出しがありません。',
    });
  }

  const selectionPromises = new Map<number, TextSource>();
  for (const source of sources) {
    const normalized = source.text.normalize('NFKC');
    for (const match of normalized.matchAll(/(\d+)選/g)) {
      const count = Number(match[1]);
      if (Number.isSafeInteger(count) && count > 0 && !selectionPromises.has(count)) {
        selectionPromises.set(count, source);
      }
    }
  }
  const availableItems = Math.max(listItemCount, bodyHeadings.length);
  for (const [promisedCount, source] of selectionPromises) {
    if (availableItems >= promisedCount) continue;
    violations.push({
      rule: 'promise-mismatch',
      severity: 'critical',
      evidence: sourceEvidence(source, `${promisedCount}選`),
      message: `${promisedCount}選を約束していますが、本文のリストまたは見出しは最大${availableItems}件です。`,
    });
  }

  const thoroughSource = findSource(sources, /徹底解説/);
  if (thoroughSource && bodyLength < 2500) {
    violations.push({
      rule: 'promise-mismatch',
      severity: 'critical',
      evidence: sourceEvidence(thoroughSource),
      message: `「徹底解説」を約束していますが、本文は${bodyLength}字です。`,
    });
  }
}

function checkUnsupportedClaims(article: string, violations: Violation[]): void {
  addPatternViolations(violations, article, 'unsupported-claims', 'major', [
    { pattern: /税務リスク(?:の|が)ない/g, message: '税務リスクがないとする保証表現です。' },
    { pattern: /必ず(?:節税|削減|通)/g, message: '効果または結果を保証する表現です。' },
    {
      pattern: /\d+%から\d+%(?:\*{1,3}|_{1,3})?(?:に|へ)/g,
      message: '根拠の確認が必要な割合改善の実績表現です。',
    },
    {
      pattern: /\d+(?:時間|日|ヶ月|か月|週間).{0,6}(?:→|から).{0,6}\d+(?:秒|分|時間|日|週間)/g,
      message: '根拠の確認が必要な時間短縮の実績表現です。',
    },
    { pattern: /業界初|日本一|No\.?1/g, message: '最上級または優位性を断定する表現です。' },
  ]);
  for (const match of article.matchAll(/100%/g)) {
    const index = match.index ?? 0;
    if (isStatutoryPercentage(article, index)) continue;
    violations.push({
      rule: 'unsupported-claims',
      severity: 'major',
      evidence: contextEvidence(ARTICLE_FILE, article, index, match[0].length),
      message: '100%とする絶対的な数値表現です。',
    });
  }
}

function isStatutoryPercentage(article: string, index: number): boolean {
  // Bind the exemption to this number, not any tax word in the sentence.
  // In particular, "税率を説明し、満足度100%" must still be reviewed.
  const before = article.slice(Math.max(0, index - 100), index);
  const after = article.slice(index + 4);
  // A guarantee is not a statutory description, even when a tax label precedes it.
  const followingClause = after.split(/[、。，．！？!?\n]/, 1)[0];
  if (/(?:保証|実現|達成|確実|成功)/.test(followingClause)) return false;
  const spacing = '[ \\t*_]*';
  const label = '(?:持株割合|益金不算入(?:割合|率)?|税率|控除(?:割合|率)?)';
  const direct = new RegExp(`${label}${spacing}(?:は|が|を|:|：)?${spacing}(?:1/3超${spacing})?$`);
  if (direct.test(before)) return true;
  // The statutory category can have its ownership percentage in parentheses.
  // Do not allow arbitrary text between that category and the exempted number.
  const category = new RegExp(`完全子法人株式等(?:[（(]持株割合${spacing}100%[）)])?${spacing}は${spacing}$`);
  if (category.test(before)) return true;
  return false;
}

function sentenceContaining(article: string, index: number): string {
  const previousPeriod = article.lastIndexOf('。', Math.max(0, index - 1));
  const previousNewline = article.lastIndexOf('\n', Math.max(0, index - 1));
  const start = Math.max(previousPeriod, previousNewline) + 1;
  const nextPeriod = article.indexOf('。', index);
  const nextNewline = article.indexOf('\n', index);
  const ends = [nextPeriod, nextNewline].filter((end) => end >= 0);
  const end = ends.length > 0 ? Math.min(...ends) : article.length;
  return article.slice(start, end).trim();
}

function checkAssertionBanned(article: string, violations: Violation[]): void {
  const conditionalPatterns = [
    { pattern: /節税できる/g, message: '「場合」の限定がない節税断定表現です。' },
    { pattern: /経費(?:に|化)できる/g, message: '「場合」の限定がない経費算入の断定表現です。' },
  ];
  const qualifiers = [
    '場合',
    'ケース',
    '条件',
    '要件',
    '限り',
    'とは限らない',
    'とは限りません',
    'わけではない',
    'わけではありません',
    '可能性',
    'なら',
    'れば',
    'かどうか',
    'でしょうか',
  ];

  for (const { pattern, message } of conditionalPatterns) {
    for (const match of article.matchAll(pattern)) {
      const index = match.index ?? 0;
      const sentence = sentenceContaining(article, index);
      const hasQualifier = qualifiers.some((qualifier) => sentence.includes(qualifier));
      const endsWithNegation = /でき(?:ない|ません)$/.test(sentence);
      if (hasQualifier || endsWithNegation) continue;
      violations.push({
        rule: 'assertion-banned',
        severity: 'major',
        evidence: contextEvidence(ARTICLE_FILE, article, index, match[0].length),
        message,
      });
    }
  }

  addPatternViolations(violations, article, 'assertion-banned', 'major', [
    { pattern: /評価額(?:が|を)下が/g, message: '評価額の低下を断定する表現です。' },
    { pattern: /損益通算の範囲が広が/g, message: '損益通算範囲の拡大を断定する表現です。' },
    { pattern: /信用力が上が/g, message: '信用力の上昇を断定する表現です。' },
  ]);
}

function checkLengthShortfall(
  article: string,
  outlineRaw: string | null,
  average: number | null,
  textLength: number,
  violations: Violation[],
): void {
  if (average === null || textLength >= average * 0.6) return;
  const line = outlineRaw ? findJsonKeyLine(outlineRaw, 'average') : 1;
  violations.push({
    rule: 'length-shortfall',
    severity: 'major',
    evidence: `outline_v2.json:${line} average=${average}; ${ARTICLE_FILE}:1 textLength=${textLength}`,
    message: `本文テキスト${textLength}字が目標平均${average}字の60%未満です。`,
  });
}

function checkStructure(article: string, violations: Violation[]): void {
  const lines = article.split('\n');
  const headings = lines
    .map((line, index) => ({ line: index + 1, index, text: line }))
    .filter((entry) => /^#{1,6}\s+/.test(entry.text));
  const h2s = headings.filter((entry) => /^##\s+/.test(entry.text));
  let lastNonEmptyIndex = lines.length - 1;
  while (lastNonEmptyIndex >= 0 && lines[lastNonEmptyIndex].trim().length === 0) {
    lastNonEmptyIndex -= 1;
  }

  if (lastNonEmptyIndex >= 0 && /^##\s+/.test(lines[lastNonEmptyIndex])) {
    violations.push({
      rule: 'structure-incomplete',
      severity: 'major',
      evidence: `${ARTICLE_FILE}:${lastNonEmptyIndex + 1} ${compact(lines[lastNonEmptyIndex])}`,
      message: '本文がH2見出しで終わっています。',
    });
  }

  const finalHeading = headings.at(-1);
  if (finalHeading) {
    const finalSectionLength = markdownText(lines.slice(finalHeading.index + 1).join('\n')).length;
    if (finalSectionLength < 80) {
      violations.push({
        rule: 'structure-incomplete',
        severity: 'major',
        evidence: `${ARTICLE_FILE}:${finalHeading.line} ${compact(finalHeading.text)}（本文${finalSectionLength}字）`,
        message: '最終見出しの本文が80字未満です。',
      });
    }
  }

  if (h2s.length < 3) {
    const evidenceLine = h2s[0]?.line ?? 1;
    violations.push({
      rule: 'structure-incomplete',
      severity: 'major',
      evidence: `${ARTICLE_FILE}:${evidenceLine} H2見出し=${h2s.length}個`,
      message: 'H2見出しが3個未満です。',
    });
  }
}

async function run(directoryArgument: string): Promise<GateResult> {
  const directory = resolve(directoryArgument);
  const article = await readFile(join(directory, ARTICLE_FILE), 'utf8');
  const articleJson = await readOptionalJson(join(directory, 'article.json'));
  const outlineJson = await readOptionalJson(join(directory, 'outline_v2.json'));
  const violations: Violation[] = [];
  const textLength = markdownText(article).length;
  const promiseSources = collectPromiseSources(article, articleJson);

  checkPlaceholders(article, violations);
  checkGenerationCorruption(article, violations);
  checkPromiseMismatch(article, promiseSources, Array.from(article).length, violations);
  checkUnsupportedClaims(article, violations);
  checkAssertionBanned(article, violations);
  checkLengthShortfall(
    article,
    outlineJson?.raw ?? null,
    getTargetAverage(outlineJson?.value ?? null),
    textLength,
    violations,
  );
  checkStructure(article, violations);

  const criticalCount = violations.filter((violation) => violation.severity === 'critical').length;
  const majorCount = violations.filter((violation) => violation.severity === 'major').length;
  const verdict = criticalCount >= 1 || majorCount >= 3 ? 'fail' : 'pass';

  return {
    dir: directory,
    verdict,
    criticalCount,
    majorCount,
    violations,
  };
}

async function main(): Promise<void> {
  const directoryArgument = process.argv[2];
  if (!directoryArgument) {
    console.error('Usage: npx tsx scripts/mechanical-gate.ts <dir>');
    process.exitCode = 2;
    return;
  }

  try {
    const result = await run(directoryArgument);
    console.log(JSON.stringify(result, null, 2));
    console.error(
      `[mechanical-gate] ${result.verdict.toUpperCase()} critical=${result.criticalCount} major=${result.majorCount} dir=${result.dir}`,
    );
    process.exitCode = result.verdict === 'fail' ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mechanical-gate] ERROR ${message}`);
    process.exitCode = 2;
  }
}

void main();
