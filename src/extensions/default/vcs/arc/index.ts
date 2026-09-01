import fs from "node:fs";
import { join } from "node:path";
import {
  buildArcDiffArgs,
  buildArcShowArgs,
  buildArcStashShowArgs,
  findArcRepoRoot,
  listArcUntrackedFiles,
  resolveArcRepoRoot,
  runArcText,
} from "../../../../core/vcs/arc";
import {
  HUNK_CORE_VCS_DETECTION_PRIORITY,
  type ExtensionVcsAdapter,
  type ExtensionVcsDiffInput,
  type HunkExtensionAPI,
} from "../../../../extension-api/types";

/** Return the last path segment for review titles. */
function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Format one untracked file's state for polling-based watch mode. */
function statSignature(path: string) {
  try {
    const stat = fs.statSync(path);
    return `${path}:${stat.size}:${stat.mtimeMs}:${stat.ino}`;
  } catch {
    return `${path}:missing`;
  }
}

/** Load Arc's tracked patch and separately reported untracked files. */
function loadArcWorkingTree(input: ExtensionVcsDiffInput, cwd: string) {
  const repoRoot = resolveArcRepoRoot(input, cwd);
  const untrackedPaths = listArcUntrackedFiles(input, { cwd });
  return {
    repoRoot,
    patchText: runArcText({ input, args: buildArcDiffArgs(input), cwd }),
    untrackedPaths,
  };
}

/** Build a polling signature without recursively watching an Arcadia checkout. */
function arcWorkingTreeSignature(input: ExtensionVcsDiffInput, cwd: string) {
  const result = loadArcWorkingTree(input, cwd);
  return [
    result.patchText,
    ...result.untrackedPaths.map((path) => statSignature(join(result.repoRoot, path))),
  ].join("\n---\n");
}

/** VCS adapter translating neutral review operations to Arc commands. */
export const ArcVcsAdapter = {
  id: "arc",
  name: "Arc",
  detect(cwd) {
    const repoRoot = findArcRepoRoot(cwd);
    return repoRoot ? { id: "arc" as const, repoRoot } : null;
  },
  // Prefer Arc when a local checkout also exposes Git-compatible metadata.
  detectionPriority: HUNK_CORE_VCS_DETECTION_PRIORITY + 50,
  operations: {
    "working-tree-diff": {
      async load(input, { cwd }) {
        const result = loadArcWorkingTree(input, cwd);
        const repoName = basename(result.repoRoot);
        const title = input.staged
          ? `${repoName} staged changes`
          : input.range
            ? `${repoName} ${input.range}`
            : `${repoName} working tree`;
        return {
          ...result,
          sourceLabel: result.repoRoot,
          title,
        };
      },
      watchSignature(input, { cwd }) {
        return arcWorkingTreeSignature(input, cwd);
      },
    },
    "revision-show": {
      async load(input, { cwd }) {
        const repoRoot = resolveArcRepoRoot(input, cwd);
        const ref = input.ref ?? "HEAD";
        return {
          repoRoot,
          sourceLabel: repoRoot,
          title: `${basename(repoRoot)} show ${ref}`,
          patchText: runArcText({ input, args: buildArcShowArgs(input), cwd }),
        };
      },
      watchSignature(input, { cwd }) {
        return runArcText({ input, args: buildArcShowArgs(input), cwd });
      },
    },
    "stash-show": {
      async load(input, { cwd }) {
        const repoRoot = resolveArcRepoRoot(input, cwd);
        const ref = input.ref ?? "latest";
        return {
          repoRoot,
          sourceLabel: repoRoot,
          title: `${basename(repoRoot)} stash ${ref}`,
          patchText: runArcText({ input, args: buildArcStashShowArgs(input), cwd }),
        };
      },
      watchSignature(input, { cwd }) {
        return runArcText({ input, args: buildArcStashShowArgs(input), cwd });
      },
    },
  },
} satisfies ExtensionVcsAdapter;

export default function (hunk: HunkExtensionAPI) {
  hunk.registerVcsAdapter(ArcVcsAdapter);
}
