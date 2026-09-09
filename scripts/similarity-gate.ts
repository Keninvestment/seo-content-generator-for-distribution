import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

interface Thresholds {
  heading: number;
  shingle: number;
}

interface SimilarityResult {
  file: string;
  headingSim: number;
  shingleSim: number;
}

interface GateResult {
  verdict: 'pass' | 'fail';
  target: string;
  corpusSize: number;
  thresholds: Thresholds;
  results: SimilarityResult[];
}

interface ParsedArguments {
  target: string;
  corpus: string;
  publishedInventory?: string;
  thresholds: Thresholds;
}

interface ArticleFeatures {
  headings: string[];
  shingles: Set<string>;
}

const DEFAULT_HEADING_THRESHOLD = 0.6;
const DEFAULT_SHINGLE_THRESHOLD = 0.25;
const SHINGLE_SIZE = 5;
const MIN_NON_ARTICLE_LENGTH = 500;
const MAX_RESULTS = 10;
const MAX_INVENTORY_BYTES = 20 * 1024 * 1024;
const MAX_PUBLISHED_BODY_BYTES = 2 * 1024 * 1024;
const USAGE =
  'Usage: npx tsx scripts/similarity-gate.ts <target.md> --corpus <dir> [--published-inventory <published_articles.json>] [--threshold-heading 0.6] [--threshold-shingle 0.25]';

function argumentError(message: string): never {
  throw new Error(message);
}

function parseThreshold(value: string | undefined, option: string): number {
  if (value === undefined) argumentError(`${option} requires a value`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    argumentError(`${option} must be a number between 0 and 1`);
  }
  return parsed;
}

function parseArguments(args: string[]): ParsedArguments {
  const target = args[0];
  if (!target || target.startsWith('--')) argumentError('target.md is required');

  let corpus: string | undefined;
  let publishedInventory: string | undefined;
  let headingThreshold = DEFAULT_HEADING_THRESHOLD;
  let shingleThreshold = DEFAULT_SHINGLE_THRESHOLD;

  for (let index = 1; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option === '--corpus') {
      if (value === undefined || value.startsWith('--')) argumentError('--corpus requires a directory');
      corpus = value;
      index += 1;
    } else if (option === '--published-inventory') {
      if (value === undefined || value.startsWith('--')) {
        argumentError('--published-inventory requires a JSON file');
      }
      publishedInventory = value;
      index += 1;
    } else if (option === '--threshold-heading') {
      headingThreshold = parseThreshold(value, option);
      index += 1;
    } else if (option === '--threshold-shingle') {
      shingleThreshold = parseThreshold(value, option);
      index += 1;
    } else {
      argumentError(`unknown argument: ${option}`);
    }
  }

  if (!corpus) argumentError('--corpus is required');
  return {
    target: resolve(target),
    corpus: resolve(corpus),
    publishedInventory: publishedInventory ? resolve(publishedInventory) : undefined,
    thresholds: { heading: headingThreshold, shingle: shingleThreshold },
  };
}

interface PublishedArticle {
  identifier: string;
  markdown: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  };
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/giu, (match, entity: string) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
    const hexadecimal = entity[1]?.toLowerCase() === 'x';
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  });
}

function htmlToMarkdown(html: string): string {
  const withoutUnsafeBlocks = html
    .replace(/<!--[^]*?-->/gu, ' ')
    .replace(/<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/giu, ' ');
  const withHeadings = withoutUnsafeBlocks
    .replace(/<h2\b[^>]*>([^]*?)<\/h2\s*>/giu, (_match, value: string) => `\n## ${value}\n`)
    .replace(/<h3\b[^>]*>([^]*?)<\/h3\s*>/giu, (_match, value: string) => `\n### ${value}\n`)
    .replace(/<\/?(?:p|div|section|article|li|ul|ol|blockquote|br|hr)\b[^>]*>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ');
  return decodeHtmlEntities(withHeadings)
    .replace(/[\t\f\v ]+/gu, ' ')
    .replace(/\s*\n\s*/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function safePublishedUrl(value: unknown, field: string): URL {
  if (typeof value !== 'string' || !value) argumentError(`${field} must be a non-empty URL`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    argumentError(`${field} must be a valid URL`);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    argumentError(`${field} must be a public HTTPS URL without credentials, query, or fragment`);
  }
  return parsed;
}

async function loadPublishedArticles(path: string): Promise<PublishedArticle[]> {
  const inventoryStat = await stat(path);
  if (!inventoryStat.isFile() || inventoryStat.size > MAX_INVENTORY_BYTES) {
    argumentError(`published inventory must be a file no larger than ${MAX_INVENTORY_BYTES} bytes`);
  }
  const raw = await readFile(path, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    argumentError('published inventory must be valid JSON');
  }
  if (!isRecord(value) || value.schema_version !== 1 || !isRecord(value.source)) {
    argumentError('published inventory requires schema_version=1 and source provenance');
  }
  const site = safePublishedUrl(value.source.site, 'source.site');
  if (typeof value.synced_at !== 'string' || !Number.isFinite(Date.parse(value.synced_at))) {
    argumentError('published inventory requires a valid synced_at');
  }
  if (!Array.isArray(value.posts)) argumentError('published inventory posts must be an array');

  const seenIds = new Set<number>();
  const seenLinks = new Set<string>();
  const articles: PublishedArticle[] = [];
  for (const [index, item] of value.posts.entries()) {
    const prefix = `posts[${index}]`;
    if (!isRecord(item) || !Number.isInteger(item.id) || (item.id as number) <= 0) {
      argumentError(`${prefix}.id must be a positive integer`);
    }
    const id = item.id as number;
    const link = safePublishedUrl(item.link, `${prefix}.link`);
    if (link.origin !== site.origin) argumentError(`${prefix}.link must have the source.site origin`);
    if (seenIds.has(id) || seenLinks.has(link.href)) {
      argumentError(`${prefix} duplicates published provenance`);
    }
    seenIds.add(id);
    seenLinks.add(link.href);
    if (typeof item.modified !== 'string' || !Number.isFinite(Date.parse(item.modified))) {
      argumentError(`${prefix}.modified must be a valid timestamp`);
    }
    if (typeof item.content_html !== 'string' || item.content_html.trim() === '') {
      argumentError(`${prefix}.content_html must contain the published body`);
    }
    if (Buffer.byteLength(item.content_html, 'utf8') > MAX_PUBLISHED_BODY_BYTES) {
      argumentError(`${prefix}.content_html exceeds ${MAX_PUBLISHED_BODY_BYTES} bytes`);
    }
    const digest = createHash('sha256').update(item.content_html, 'utf8').digest('hex');
    if (typeof item.content_sha256 !== 'string' || item.content_sha256.toLowerCase() !== digest) {
      argumentError(`${prefix}.content_sha256 does not match content_html`);
    }
    articles.push({
      identifier: `published:${id}:${link.href}:sha256:${digest}`,
      markdown: htmlToMarkdown(item.content_html),
    });
  }
  return articles;
}

function isExcludedBasename(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower === 'evidence_pack.md' ||
    /^sol_review.*\.md$/.test(lower) ||
    /^tax_qa_review.*\.md$/.test(lower) ||
    lower === 'meta.yaml' ||
    /^.*_prompt.*\.md$/.test(lower)
  );
}

function isArticleBasename(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower === 'article_final.md' || /^article_.*\.md$/.test(lower);
}

async function collectMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareText(left.name, right.name));

  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(path)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(resolve(path));
    }
  }
  return files;
}

function normalizeHeading(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\p{N}\s]/gu, '');
}

function extractHeadings(markdown: string): string[] {
  const headings: string[] = [];
  let fenceCharacter: '`' | '~' | null = null;
  let fenceLength = 0;

  for (const line of markdown.split(/\r?\n/)) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (fence) {
      const character = fence[0] as '`' | '~';
      if (fenceCharacter === null) {
        fenceCharacter = character;
        fenceLength = fence.length;
      } else if (character === fenceCharacter && fence.length >= fenceLength) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }
    if (fenceCharacter !== null) continue;

    const match = line.match(/^#{2,3}(?!#)\s+(.+?)\s*#*\s*$/u);
    if (!match) continue;
    const normalized = normalizeHeading(match[1]);
    if (normalized) headings.push(normalized);
  }
  return headings;
}

function extractBody(markdown: string): string {
  const bodyLines: string[] = [];
  let fenceCharacter: '`' | '~' | null = null;
  let fenceLength = 0;

  for (const line of markdown.split(/\r?\n/)) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (fence) {
      const character = fence[0] as '`' | '~';
      if (fenceCharacter === null) {
        fenceCharacter = character;
        fenceLength = fence.length;
      } else if (character === fenceCharacter && fence.length >= fenceLength) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }
    if (fenceCharacter !== null) continue;
    if (/^\s{0,3}#{1,6}(?:\s+|$)/u.test(line)) continue;
    bodyLines.push(line);
  }

  return bodyLines.join('\n').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function makeShingles(text: string): Set<string> {
  const characters = Array.from(text);
  const shingles = new Set<string>();
  for (let index = 0; index + SHINGLE_SIZE <= characters.length; index += 1) {
    shingles.add(characters.slice(index, index + SHINGLE_SIZE).join(''));
  }
  return shingles;
}

function articleFeatures(markdown: string): ArticleFeatures {
  return {
    headings: extractHeadings(markdown),
    shingles: makeShingles(extractBody(markdown)),
  };
}

function jaccard<T>(left: Set<T>, right: Set<T>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function lcsLength(left: string[], right: string[]): number {
  let previous = new Array<number>(right.length + 1).fill(0);
  for (const leftValue of left) {
    const current = new Array<number>(right.length + 1).fill(0);
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] =
        leftValue === right[rightIndex - 1]
          ? previous[rightIndex - 1] + 1
          : Math.max(previous[rightIndex], current[rightIndex - 1]);
    }
    previous = current;
  }
  return previous[right.length];
}

function headingSimilarity(left: string[], right: string[]): number {
  const setSimilarity = jaccard(new Set(left), new Set(right));
  const maximumLength = Math.max(left.length, right.length);
  const sequenceSimilarity = maximumLength === 0 ? 0 : lcsLength(left, right) / maximumLength;
  return Math.max(setSimilarity, sequenceSimilarity);
}

function compareResults(left: SimilarityResult, right: SimilarityResult): number {
  const maximumDifference =
    Math.max(right.headingSim, right.shingleSim) - Math.max(left.headingSim, left.shingleSim);
  if (maximumDifference !== 0) return maximumDifference;
  if (right.headingSim !== left.headingSim) return right.headingSim - left.headingSim;
  if (right.shingleSim !== left.shingleSim) return right.shingleSim - left.shingleSim;
  return compareText(left.file, right.file);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function runGate(arguments_: ParsedArguments): Promise<GateResult> {
  const targetMarkdown = await readFile(arguments_.target, 'utf8');
  const targetFeatures = articleFeatures(targetMarkdown);
  const corpusFiles = await collectMarkdownFiles(arguments_.corpus);
  const results: SimilarityResult[] = [];

  for (const file of corpusFiles) {
    const fileName = basename(file);
    if (file === arguments_.target || isExcludedBasename(fileName)) continue;

    const markdown = await readFile(file, 'utf8');
    const body = extractBody(markdown);
    if (!isArticleBasename(fileName) && Array.from(body).length < MIN_NON_ARTICLE_LENGTH) continue;

    const features: ArticleFeatures = {
      headings: extractHeadings(markdown),
      shingles: makeShingles(body),
    };
    results.push({
      file,
      headingSim: headingSimilarity(targetFeatures.headings, features.headings),
      shingleSim: jaccard(targetFeatures.shingles, features.shingles),
    });
  }

  if (arguments_.publishedInventory) {
    const publishedArticles = await loadPublishedArticles(arguments_.publishedInventory);
    for (const article of publishedArticles) {
      const features = articleFeatures(article.markdown);
      results.push({
        file: article.identifier,
        headingSim: headingSimilarity(targetFeatures.headings, features.headings),
        shingleSim: jaccard(targetFeatures.shingles, features.shingles),
      });
    }
  }

  results.sort(compareResults);
  const verdict = results.some(
    (result) =>
      result.headingSim >= arguments_.thresholds.heading ||
      result.shingleSim >= arguments_.thresholds.shingle,
  )
    ? 'fail'
    : 'pass';

  return {
    verdict,
    target: arguments_.target,
    corpusSize: results.length,
    thresholds: arguments_.thresholds,
    results: results.slice(0, MAX_RESULTS),
  };
}

function printSummary(result: GateResult): void {
  const worst = result.results[0];
  const worstSummary = worst
    ? `${worst.file} heading=${worst.headingSim.toFixed(3)} shingle=${worst.shingleSim.toFixed(3)}`
    : 'none';
  console.error(`[similarity-gate] ${result.verdict.toUpperCase()} worst=${worstSummary}`);
}

async function main(): Promise<void> {
  let arguments_: ParsedArguments;
  try {
    arguments_ = parseArguments(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(USAGE);
    console.error(`[similarity-gate] ERROR ${message}`);
    process.exitCode = 2;
    return;
  }

  try {
    const result = await runGate(arguments_);
    console.log(JSON.stringify(result, null, 2));
    printSummary(result);
    process.exitCode = result.verdict === 'fail' ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[similarity-gate] ERROR ${message}`);
    process.exitCode = 2;
  }
}

void main();
