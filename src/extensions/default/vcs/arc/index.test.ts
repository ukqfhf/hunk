import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArcVcsAdapter } from ".";
import type { ExtensionVcsOperations } from "../../../../extension-api/types";

const arcOperations: ExtensionVcsOperations = ArcVcsAdapter.operations;
const tempDirs: string[] = [];

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

describe("ArcVcsAdapter", () => {
  test("detects Arcadia repositories from nested directories", () => {
    const repo = createTempDir("hunk-arc-adapter-detect-");
    writeFileSync(join(repo, ".arcadia.root"), "");
    const nested = join(repo, "src", "nested");
    mkdirSync(nested, { recursive: true });

    expect(ArcVcsAdapter.detect(nested)).toEqual({ id: "arc", repoRoot: repo });
  });

  test("returns null outside an Arc repository", () => {
    expect(ArcVcsAdapter.detect(createTempDir("hunk-arc-adapter-none-"))).toBeNull();
  });

  test("publishes diff, show, and stash operations", () => {
    expect(arcOperations["working-tree-diff"]).toBeDefined();
    expect(arcOperations["revision-show"]).toBeDefined();
    expect(arcOperations["stash-show"]).toBeDefined();
    expect(ArcVcsAdapter.detectionPriority).toBeGreaterThan(0);
  });
});
