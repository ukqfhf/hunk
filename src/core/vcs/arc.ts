import fs from "node:fs";
import { dirname, resolve } from "node:path";
import {
  HunkExtensionUserError,
  type ExtensionVcsDiffInput,
  type ExtensionVcsShowInput,
  type ExtensionVcsStashShowInput,
} from "../../extension-api/types";

export type ArcBackedInput =
  | ExtensionVcsDiffInput
  | ExtensionVcsShowInput
  | ExtensionVcsStashShowInput;

export interface RunArcTextOptions {
  input: ArcBackedInput;
  args: string[];
  cwd?: string;
  arcExecutable?: string;
}

interface ArcStatusOutput {
  status?: {
    untracked?: Array<{ path?: unknown; type?: unknown }>;
  };
}

/** Append Arc path filters after an explicit separator. */
function appendArcPathspecs(args: string[], pathspecs?: string[]) {
  if (!pathspecs || pathspecs.length === 0) {
    return;
  }

  args.push("--", ...pathspecs);
}

/** Build an Arc working-tree, staged, or target diff in Git patch format. */
export function buildArcDiffArgs(input: ExtensionVcsDiffInput) {
  const args = ["diff", "--git", "--no-color"];

  if (input.staged) {
    args.push("--cached");
  }
  if (input.range) {
    args.push(input.range);
  }

  appendArcPathspecs(args, input.pathspecs);
  return args;
}

/** Build the Arc commit display used by `hunk show`. */
export function buildArcShowArgs(input: ExtensionVcsShowInput) {
  const args = ["show", "--git", "--no-color", input.ref ?? "HEAD"];

  // Arc show treats `--` as a literal path, unlike Arc diff and status.
  args.push(...(input.pathspecs ?? []));
  return args;
}

/** Build the Arc stash display used by `hunk stash show`. */
export function buildArcStashShowArgs(input: ExtensionVcsStashShowInput) {
  const args = ["stash", "show", "--git"];
  if (input.ref) {
    args.push(input.ref);
  }
  return args;
}

/** Build the JSON status query used to discover Arc untracked files. */
export function buildArcStatusArgs(input: ExtensionVcsDiffInput) {
  const args = ["status", "--json", "-u", "all"];
  appendArcPathspecs(args, input.pathspecs);
  return args;
}

/** Return the command label used in Arc-facing errors. */
export function formatArcCommandLabel(input: ArcBackedInput) {
  switch (input.kind) {
    case "vcs":
      if (input.staged) {
        return "hunk diff --staged";
      }
      return input.range ? `hunk diff ${input.range}` : "hunk diff";
    case "show":
      return input.ref ? `hunk show ${input.ref}` : "hunk show";
    case "stash-show":
      return input.ref ? `hunk stash show ${input.ref}` : "hunk stash show";
  }
}

/** Find the nearest Arc checkout marker without spawning Arc during detection. */
export function findArcRepoRoot(cwd: string) {
  let current = resolve(cwd);

  for (;;) {
    if (
      fs.existsSync(resolve(current, ".arcadia.root")) ||
      fs.existsSync(resolve(current, ".arc"))
    ) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function firstArcErrorLine(stderr: string) {
  return (
    stderr
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "Arc command failed."
  ).replace(/^error:\s*/i, "");
}

function createMissingArcExecutableError(input: ArcBackedInput, arcExecutable: string) {
  return new HunkExtensionUserError(
    `Arc is required for \`${formatArcCommandLabel(input)}\` when \`vcs = "arc"\`, but \`${arcExecutable}\` was not found in PATH.`,
    { suggestions: ["Install Arc or select another VCS backend, then try again."] },
  );
}

function createMissingArcRepoError(input: ArcBackedInput) {
  return new HunkExtensionUserError(
    `\`${formatArcCommandLabel(input)}\` must be run inside an Arc repository when \`vcs = "arc"\`.`,
    { suggestions: ["Run the command from an Arc checkout or select another VCS backend."] },
  );
}

function translateArcSpawnFailure(input: ArcBackedInput, error: unknown, arcExecutable: string) {
  if (error instanceof HunkExtensionUserError) {
    return error;
  }
  if (error instanceof Error && error.message.includes("Executable not found in $PATH")) {
    return createMissingArcExecutableError(input, arcExecutable);
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Spawn one Arc command with deterministic non-interactive I/O. */
export function runArcText({
  input,
  args,
  cwd = process.cwd(),
  arcExecutable = "arc",
}: RunArcTextOptions) {
  let proc: ReturnType<typeof Bun.spawnSync>;

  try {
    proc = Bun.spawnSync([arcExecutable, ...args], {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    throw translateArcSpawnFailure(input, error, arcExecutable);
  }

  const stdout = Buffer.from(proc.stdout ?? []).toString("utf8");
  const stderr = Buffer.from(proc.stderr ?? []).toString("utf8");
  if (proc.exitCode !== 0) {
    throw new HunkExtensionUserError(`\`${formatArcCommandLabel(input)}\` failed.`, {
      suggestions: [firstArcErrorLine(stderr)],
    });
  }

  return stdout;
}

/** Resolve the checkout root already established by Arc marker detection. */
export function resolveArcRepoRoot(input: ArcBackedInput, cwd = process.cwd()) {
  const repoRoot = findArcRepoRoot(cwd);
  if (!repoRoot) {
    throw createMissingArcRepoError(input);
  }
  return repoRoot;
}

/** Parse root-relative untracked file paths from `arc status --json`. */
export function parseArcUntrackedPaths(statusText: string) {
  const output = JSON.parse(statusText) as ArcStatusOutput;
  return (output.status?.untracked ?? []).flatMap((entry) =>
    typeof entry.path === "string" && entry.type !== "directory" ? [entry.path] : [],
  );
}

/** Return untracked Arc files for a working-tree review. */
export function listArcUntrackedFiles(
  input: ExtensionVcsDiffInput,
  options: Omit<RunArcTextOptions, "input" | "args"> = {},
) {
  if (input.staged || input.options.excludeUntracked === true) {
    return [];
  }

  return parseArcUntrackedPaths(runArcText({ input, args: buildArcStatusArgs(input), ...options }));
}
