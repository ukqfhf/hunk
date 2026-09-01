import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildArcDiffArgs,
  buildArcShowArgs,
  buildArcStashShowArgs,
  buildArcStatusArgs,
  findArcRepoRoot,
  parseArcUntrackedPaths,
  runArcText,
} from "./arc";
import type {
  ExtensionVcsDiffInput,
  ExtensionVcsShowInput,
  ExtensionVcsStashShowInput,
} from "../../extension-api/types";

const tempDirs: string[] = [];

/** Build one Arc working-tree input for command helper tests. */
function diffInput(overrides: Partial<ExtensionVcsDiffInput> = {}): ExtensionVcsDiffInput {
  return { kind: "vcs", staged: false, options: {}, ...overrides };
}

function createTempDir(prefix: string) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Arc command helpers", () => {
  test("builds working-tree, staged, and target diffs", () => {
    expect(buildArcDiffArgs(diffInput())).toEqual(["diff", "--git", "--no-color"]);
    expect(buildArcDiffArgs(diffInput({ staged: true }))).toEqual([
      "diff",
      "--git",
      "--no-color",
      "--cached",
    ]);
    expect(buildArcDiffArgs(diffInput({ range: "trunk", pathspecs: ["src/app.ts"] }))).toEqual([
      "diff",
      "--git",
      "--no-color",
      "trunk",
      "--",
      "src/app.ts",
    ]);
  });

  test("keeps Arc show path filters positional", () => {
    const input = {
      kind: "show",
      ref: "HEAD",
      pathspecs: ["src/app.ts"],
      options: {},
    } satisfies ExtensionVcsShowInput;
    expect(buildArcShowArgs(input)).toEqual(["show", "--git", "--no-color", "HEAD", "src/app.ts"]);
  });

  test("builds stash and untracked status queries", () => {
    const stashInput = {
      kind: "stash-show",
      ref: "stash@{1}",
      options: {},
    } satisfies ExtensionVcsStashShowInput;
    expect(buildArcStashShowArgs(stashInput)).toEqual(["stash", "show", "--git", "stash@{1}"]);
    expect(buildArcStatusArgs(diffInput({ pathspecs: ["src"] }))).toEqual([
      "status",
      "--json",
      "-u",
      "all",
      "--",
      "src",
    ]);
  });

  test("parses only untracked files from Arc JSON status", () => {
    expect(
      parseArcUntrackedPaths(
        JSON.stringify({
          status: {
            untracked: [
              { status: "untracked", path: "src/new.ts", type: "file" },
              { status: "untracked", path: "generated", type: "directory" },
              { status: "untracked", type: "file" },
            ],
          },
        }),
      ),
    ).toEqual(["src/new.ts"]);
  });

  test("finds .arcadia.root and .arc markers from nested directories", () => {
    for (const marker of [".arcadia.root", ".arc"]) {
      const repo = createTempDir(`hunk-arc-${marker.slice(1)}-`);
      if (marker === ".arc") {
        mkdirSync(join(repo, marker));
      } else {
        writeFileSync(join(repo, marker), "");
      }
      const nested = join(repo, "src", "nested");
      mkdirSync(nested, { recursive: true });
      expect(findArcRepoRoot(nested)).toBe(repo);
    }
  });

  test("reports a friendly error when Arc is unavailable", () => {
    expect(() =>
      runArcText({
        input: diffInput(),
        args: ["diff"],
        arcExecutable: "definitely-not-a-real-arc-binary",
      }),
    ).toThrow(
      'Arc is required for `hunk diff` when `vcs = "arc"`, but `definitely-not-a-real-arc-binary` was not found in PATH.',
    );
  });
});
