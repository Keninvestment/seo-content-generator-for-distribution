import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import yaml from 'js-yaml';

const ALLOWED_ARTICLE_TYPES = ['解説型', '比較・判断型', '手順型', 'Q&A型', 'ケース型'] as const;
const ALLOWED_SOURCE_BASES = ['keyword_intent', 'evidence_pack', 'both'] as const;
const DEFAULT_MAX_CONSECUTIVE = 2;
const MAX_META_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const USAGE =
  'Usage: npx tsx scripts/article-type-gate.ts <meta.yaml> --source <evidence_pack.md> --history <lane_queue_dir> [--max-consecutive 2]';

interface ParsedArguments {
  meta: string;
  source: string;
  history: string;
  maxConsecutive: number;
}

interface MetaRecord {
  path: string;
  slug: string;
  createdAt: number;
  articleType: string;
}

interface GateResult {
  verdict: 'pass';
  articleType: string;
  allowedArticleTypes: readonly string[];
  source: { path: string; sha256: string; basis: string };
  consecutiveCount: number;
  maxConsecutive: number;
}

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseArguments(args: string[]): ParsedArguments {
  const meta = args[0];
  if (!meta || meta.startsWith('--')) fail('meta.yaml is required');
  let source: string | undefined;
  let history: string | undefined;
  let maxConsecutive = DEFAULT_MAX_CONSECUTIVE;
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option === '--source') {
      if (!value || value.startsWith('--')) fail('--source requires a file');
      source = value;
      index += 1;
    } else if (option === '--history') {
      if (!value || value.startsWith('--')) fail('--history requires a directory');
      history = value;
      index += 1;
    } else if (option === '--max-consecutive') {
      if (!value || !/^\d+$/u.test(value) || Number(value) < 1 || Number(value) > 20) {
        fail('--max-consecutive must be an integer between 1 and 20');
      }
      maxConsecutive = Number(value);
      index += 1;
    } else {
      fail(`unknown argument: ${option}`);
    }
  }
  if (!source) fail('--source is required');
  if (!history) fail('--history is required');
  return { meta: resolve(meta), source: resolve(source), history: resolve(history), maxConsecutive };
}

interface BoundedFile {
  bytes: Buffer;
  text: string;
}

async function readBounded(path: string, maximumBytes: number, label: string): Promise<BoundedFile> {
  const info = await stat(path);
  if (!info.isFile() || info.size > maximumBytes) {
    fail(`${label} must be a file no larger than ${maximumBytes} bytes`);
  }
  const bytes = await readFile(path);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} must be valid UTF-8`);
  }
  return { bytes, text };
}

function parseYamlRecord(raw: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
  } catch {
    fail(`${label} must be valid YAML`);
  }
  if (!isRecord(value)) fail(`${label} must contain a mapping`);
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} is required`);
  return value.trim();
}

function parseCreatedAt(value: unknown, field: string): number {
  const raw = requiredString(value, field);
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) fail(`${field} must be a valid timestamp`);
  return timestamp;
}

async function collectMetaFiles(directory: string): Promise<string[]> {
  const info = await stat(directory);
  if (!info.isDirectory()) fail('--history must be a directory');
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const result: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await collectMetaFiles(path)));
    else if (entry.isFile() && entry.name.toLowerCase() === 'meta.yaml') result.push(path);
  }
  return result;
}

async function historicalRecords(history: string, targetPath: string): Promise<MetaRecord[]> {
  const records: MetaRecord[] = [];
  const slugs = new Set<string>();
  const timestamps = new Set<number>();
  for (const path of await collectMetaFiles(history)) {
    if (path === targetPath) continue;
    const raw = await readBounded(path, MAX_META_BYTES, `history meta ${path}`);
    const meta = parseYamlRecord(raw.text, `history meta ${path}`);
    const articleType = requiredString(meta.article_type, `${path}: article_type`);
    if (!ALLOWED_ARTICLE_TYPES.includes(articleType as (typeof ALLOWED_ARTICLE_TYPES)[number])) {
      fail(`${path}: article_type is not allowed`);
    }
    const slug = requiredString(meta.slug, `${path}: slug`);
    const createdAt = parseCreatedAt(meta.created_at, `${path}: created_at`);
    if (slugs.has(slug) || timestamps.has(createdAt)) {
      fail('history contains duplicate slug or created_at provenance');
    }
    slugs.add(slug);
    timestamps.add(createdAt);
    records.push({ path, slug, createdAt, articleType });
  }
  return records.sort((left, right) => left.createdAt - right.createdAt || left.path.localeCompare(right.path));
}

async function runGate(args: ParsedArguments): Promise<GateResult> {
  const metaRaw = await readBounded(args.meta, MAX_META_BYTES, 'meta');
  const meta = parseYamlRecord(metaRaw.text, 'meta');
  const articleType = requiredString(meta.article_type, 'article_type');
  if (!ALLOWED_ARTICLE_TYPES.includes(articleType as (typeof ALLOWED_ARTICLE_TYPES)[number])) {
    fail(`article_type must be one of: ${ALLOWED_ARTICLE_TYPES.join(', ')}`);
  }
  const slug = requiredString(meta.slug, 'slug');
  const createdAt = parseCreatedAt(meta.created_at, 'created_at');
  if (!isRecord(meta.article_type_source)) fail('article_type_source is required');
  const sourcePath = requiredString(meta.article_type_source.path, 'article_type_source.path');
  const sourceDigest = requiredString(meta.article_type_source.sha256, 'article_type_source.sha256').toLowerCase();
  const basis = requiredString(meta.article_type_source.basis, 'article_type_source.basis');
  requiredString(meta.article_type_source.rationale, 'article_type_source.rationale');
  if (!ALLOWED_SOURCE_BASES.includes(basis as (typeof ALLOWED_SOURCE_BASES)[number])) {
    fail(`article_type_source.basis must be one of: ${ALLOWED_SOURCE_BASES.join(', ')}`);
  }
  if (isAbsolute(sourcePath) || sourcePath.split(/[\\/]/u).includes('..')) {
    fail('article_type_source.path must be a relative path without parent traversal');
  }
  const recordedSource = resolve(dirname(args.meta), sourcePath);
  if (recordedSource !== args.source) fail('--source does not match article_type_source.path');
  if (!/^[0-9a-f]{64}$/u.test(sourceDigest)) fail('article_type_source.sha256 must be lowercase SHA-256');
  const sourceRaw = await readBounded(args.source, MAX_SOURCE_BYTES, 'article type source');
  if (sourceRaw.text.trim() === '') fail('article type source must not be empty');
  const actualDigest = createHash('sha256').update(sourceRaw.bytes).digest('hex');
  if (actualDigest !== sourceDigest) fail('article_type_source.sha256 does not match --source');

  const records = await historicalRecords(args.history, args.meta);
  if (records.some((record) => record.slug === slug || record.createdAt === createdAt)) {
    fail('target duplicates history slug or created_at provenance');
  }
  if (records.some((record) => record.createdAt >= createdAt)) {
    fail('target created_at must be strictly later than every history record');
  }
  let consecutiveCount = 1;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].articleType !== articleType) break;
    consecutiveCount += 1;
  }
  if (consecutiveCount > args.maxConsecutive) {
    fail(`article_type would exceed max consecutive count ${args.maxConsecutive}`);
  }
  return {
    verdict: 'pass',
    articleType,
    allowedArticleTypes: ALLOWED_ARTICLE_TYPES,
    source: { path: relative(dirname(args.meta), args.source), sha256: actualDigest, basis },
    consecutiveCount,
    maxConsecutive: args.maxConsecutive,
  };
}

async function main(): Promise<void> {
  let args: ParsedArguments;
  try {
    args = parseArguments(process.argv.slice(2));
    const result = await runGate(args);
    console.log(JSON.stringify(result, null, 2));
    console.error(
      `[article-type-gate] PASS type=${result.articleType} consecutive=${result.consecutiveCount}/${result.maxConsecutive}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(USAGE);
    console.error(`[article-type-gate] ERROR ${message}`);
    process.exitCode = 2;
  }
}

void main();
