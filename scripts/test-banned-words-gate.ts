import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { assertNoBannedWords, BannedWordsError } from "./lib/bannedWordsGate";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml") as { load(source: string): unknown };
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrow(run: () => void, message: string): unknown {
  try {
    run();
  } catch (error: unknown) {
    return error;
  }
  throw new Error(message);
}

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function runStubTests(): void {
  const dir = mkdtempSync(resolve(tmpdir(), "banned-words-gate-"));
  const fakePython = resolve(dir, "python");
  const previousPython = process.env.CONTENT_FILTERS_PYTHON;

  try {
    process.env.CONTENT_FILTERS_PYTHON = fakePython;

    writeFileSync(fakePython, '#!/bin/sh\nprintf \'{"hits": []}\\n\'\n', {
      mode: 0o755,
    });
    assertNoBannedWords("private test body", "stub:clean");

    writeFileSync(
      fakePython,
      '#!/bin/sh\nprintf \'{"hits": ["dummy"]}\\n\'\nexit 3\n',
      { mode: 0o755 },
    );
    const hitError = expectThrow(
      () => assertNoBannedWords("private test body", "stub:hit"),
      "exit 3 must throw",
    );
    check(hitError instanceof BannedWordsError, "exit 3 error type");
    check(hitError.hits.includes("dummy"), "exit 3 hits");

    writeFileSync(fakePython, "#!/bin/sh\nexit 2\n", { mode: 0o755 });
    const usageError = expectThrow(
      () => assertNoBannedWords("private test body", "stub:usage"),
      "exit 2 must throw",
    );
    check(!(usageError instanceof BannedWordsError), "exit 2 error type");

    process.env.CONTENT_FILTERS_PYTHON = resolve(dir, "missing-python");
    expectThrow(
      () => assertNoBannedWords("private test body", "stub:missing"),
      "spawn failure must throw",
    );

    process.env.CONTENT_FILTERS_PYTHON = fakePython;
    writeFileSync(fakePython, "#!/bin/sh\nprintf 'not-json\\n'\n", {
      mode: 0o755,
    });
    expectThrow(
      () => assertNoBannedWords("private test body", "stub:invalid-json"),
      "invalid JSON must throw",
    );
  } finally {
    setEnv("CONTENT_FILTERS_PYTHON", previousPython);
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("PASS stub tests");
}

function getFirstBannedWord(config: unknown): string {
  if (typeof config !== "object" || config === null) {
    throw new Error("invalid banned words config");
  }

  const value = config as {
    words?: unknown;
    banned_words?: unknown;
  };
  if (Array.isArray(value.words) && typeof value.words[0] === "string") {
    return value.words[0];
  }
  if (
    Array.isArray(value.banned_words) &&
    typeof value.banned_words[0] === "object" &&
    value.banned_words[0] !== null &&
    "word" in value.banned_words[0] &&
    typeof value.banned_words[0].word === "string"
  ) {
    return value.banned_words[0].word;
  }
  throw new Error("banned words config has no usable first word");
}

function runLiveSmoke(): void {
  const orchestratorRoot =
    process.env.ORCHESTRATOR_ROOT ??
    resolve(REPO_ROOT, "..", "260107_orchestrator");
  const python = resolve(orchestratorRoot, ".venv", "bin", "python");
  if (!existsSync(python)) {
    console.log("SKIP live smoke (Python venv not found)");
    return;
  }

  const configPaths = [
    resolve(orchestratorRoot, "config", "banned_words_seo.yaml"),
    resolve(
      orchestratorRoot,
      "config",
      "content_filters",
      "banned_words_seo.yaml",
    ),
  ];
  const configPath = configPaths.find(existsSync);
  check(configPath, "banned words config not found");
  const bannedWord = getFirstBannedWord(
    yaml.load(readFileSync(configPath, "utf-8")),
  );

  const previousPython = process.env.CONTENT_FILTERS_PYTHON;
  const previousRoot = process.env.ORCHESTRATOR_ROOT;
  try {
    process.env.CONTENT_FILTERS_PYTHON = python;
    process.env.ORCHESTRATOR_ROOT = orchestratorRoot;
    assertNoBannedWords("<p>こんにちは</p>", "live:clean");
    const hitError = expectThrow(
      () => assertNoBannedWords(`<p>${bannedWord}</p>`, "live:hit"),
      "live banned word must throw",
    );
    check(hitError instanceof BannedWordsError, "live hit error type");
    check(hitError.hits.includes(bannedWord), "live hit result");
  } finally {
    setEnv("CONTENT_FILTERS_PYTHON", previousPython);
    setEnv("ORCHESTRATOR_ROOT", previousRoot);
  }

  console.log("PASS live smoke");
}

try {
  runStubTests();
  runLiveSmoke();
  console.log("ALL PASS");
} catch {
  console.error("FAIL banned words gate tests");
  process.exitCode = 1;
}
