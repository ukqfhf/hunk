---
title: Arc, Jujutsu, and Sapling
description: Review Arc changes or use native revsets in jj and Sapling workspaces.
---

Hunk detects Arc, Git, Jujutsu (`jj`), and Sapling (`sl`) repositories and passes targets to the detected backend.

## Arc

Arc checkouts are detected from `.arcadia.root` or `.arc`. Hunk requests Git-format patches from Arc for each review operation:

```bash
hunk diff
hunk diff --staged
hunk show HEAD
hunk stash show
```

Arc watch mode polls the selected diff rather than recursively observing the checkout.

## Jujutsu

```bash
hunk diff
hunk diff @-
hunk show @
```

Configure Hunk as jj's pager and request Git-format diffs:

```toml
[ui]
pager = ["hunk", "pager"]
diff-formatter = ":git"
```

Edit user settings with `jj config edit --user`.

## Sapling

```bash
hunk diff
hunk diff .^
hunk show .
```

Configure pager output with `sl config -u`:

```ini
[pager]
pager = hunk pager
```

## Override detection

Set the backend in Hunk config when a checkout is ambiguous:

```toml
vcs = "jj" # git, jj, sl, or arc
```

Jujutsu and Sapling do not have Git's staging area or stash review. Arc, Jujutsu, and Sapling watch mode currently polls rather than observing repository files directly.
