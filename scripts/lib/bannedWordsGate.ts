import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export class BannedWordsError extends Error {
  readonly hits: string[];
  readonly label: string;

  constructor(hits: string[], label: string) {
    super(`Banned words detected [${label}]: ${hits.join(", ")}`);
    this.name = "BannedWordsError";
    this.hits = hits;
    this.label = label;
  }
}

function parseHits(stdout: string, label: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Banned words check returned invalid JSON [${label}]`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("hits" in parsed) ||
    !Array.isArray(parsed.hits) ||
    !parsed.hits.every((hit): hit is string => typeof hit === "string")
  ) {
    throw new Error(`Banned words check returned an invalid result [${label}]`);
  }

  return parsed.hits;
}

export function assertNoBannedWords(
  html: string,
  label: string,
  scope: string = "seo",
): void {
  const orchestratorRoot =
    process.env.ORCHESTRATOR_ROOT ??
    resolve(REPO_ROOT, "..", "260107_orchestrator");
  const python =
    process.env.CONTENT_FILTERS_PYTHON ??
    resolve(orchestratorRoot, ".venv", "bin", "python");

  let stdout: string;
  try {
    stdout = execFileSync(
      python,
      ["-m", "shared.content_filters.cli", "--scope", scope],
      {
        cwd: orchestratorRoot,
        input: html,
        encoding: "utf-8",
        maxBuffer: 32 * 1024 * 1024,
      },
    );
  } catch (error: unknown) {
    const commandError = error as {
      status?: number | null;
      code?: string;
      stdout?: string | Buffer;
    };
    if (commandError.status === 3) {
      const stdout =
        typeof commandError.stdout === "string"
          ? commandError.stdout
          : commandError.stdout?.toString("utf-8") ?? "";
      throw new BannedWordsError(parseHits(stdout, label), label);
    }
    if (commandError.status !== undefined && commandError.status !== null) {
      throw new Error(
        `Banned words check failed with exit code ${commandError.status} [${label}]`,
      );
    }
    if (commandError.code) {
      throw new Error(
        `Banned words check could not start (${commandError.code}) [${label}]`,
      );
    }
    throw new Error(`Banned words check failed [${label}]`);
  }

  const hits = parseHits(stdout, label);
  if (hits.length > 0) {
    throw new Error(
      `Banned words check returned hits with exit code 0 [${label}]`,
    );
  }
}
