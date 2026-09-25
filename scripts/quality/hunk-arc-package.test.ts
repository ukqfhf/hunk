import { describe, expect, test } from "bun:test";
import arcExtension, { ArcVcsAdapter } from "@hunk/arc";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadBundledExtensions } from "../../packages/hunk/src/extensions/default/vcs";

const REPO_ROOT = resolve(import.meta.dir, "../..");

describe("@hunk/arc package boundary", () => {
  test("loads Arc through the bundled registry with all review operations", () => {
    expect(typeof arcExtension).toBe("function");
    const bundled = loadBundledExtensions();
    expect(bundled.issues).toEqual([]);
    const entry = bundled.registry.vcsAdapters.find((entry) => entry.adapter.id === "arc");
    expect(entry).toBeDefined();
    expect(Object.keys(entry!.adapter.operations)).toEqual(Object.keys(ArcVcsAdapter.operations));
    expect(entry!.adapter.operations["working-tree-diff"]).toBeDefined();
    expect(entry!.adapter.operations["revision-show"]).toBeDefined();
    expect(entry!.adapter.operations["stash-show"]).toBeDefined();
  });

  test("keeps the provider private while including it in workspace locks", () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, "packages/hunk-arc/package.json"), "utf8"),
    );
    expect(manifest.name).toBe("@hunk/arc");
    expect(manifest.private).toBe(true);
    expect(Object.keys(manifest.exports)).toEqual(["."]);
    expect(manifest.dependencies).toEqual({ "@hunk/vcs": "workspace:*", hunkdiff: "workspace:*" });
    const hunkManifest = readFileSync(join(REPO_ROOT, "packages/hunk/package.json"), "utf8");
    expect(hunkManifest).not.toContain("@hunk/arc");
    expect(readFileSync(join(REPO_ROOT, "bun.lock"), "utf8")).toContain(
      '"@hunk/arc@workspace:packages/hunk-arc"',
    );
    expect(readFileSync(join(REPO_ROOT, "nix/bun.lock.nix"), "utf8")).toContain(
      '"@hunk/arc" = copyPathToStore ../packages/hunk-arc;',
    );
  });
});
