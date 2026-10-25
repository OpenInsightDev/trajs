---
name: land
description: >-
  Land this thread's changes into the trajs repository by committing them and
  pushing to origin. Use only when the user has explicitly requested landing,
  such as the Land Changes action or a request to merge or push the thread's
  work. Do not invoke for review, preparation, or passing checks alone.
disable-model-invocation: true
metadata:
  delta-action: land
---

# Land

Landing means the thread's work is committed and pushed to `origin`
(`https://github.com/OpenInsightDev/trajs.git`). An explicit landing request —
the Land Changes action or equivalent user language — is the trigger: proceed
with this workflow instead of asking whether to merge. Stop only for the genuine
blockers listed under Gates and Divergence.

## 1. Preflight (read-only)

- `git remote -v`: the landing target is `origin`. If `origin` is missing or
  points somewhere else, stop and report instead of guessing.
- `git status --short --branch`: note the current branch and the uncommitted and
  untracked work; that work is what lands.
- `git fetch origin` then `git rev-parse --verify origin/main`: find out whether
  the remote already has `main`. A brand-new remote has none, and the first
  landing creates it.

## 2. Comment pass (required)

Before committing, apply the rules in `.agents/skills/comments/SKILL.md` to
the files being landed: delete filler comments and comments that restate what the
code already makes clear, keep only comments that explain why, and leave the
public API documentation alone. Report what was removed. This runs before the
checks so the verified artifact is what gets pushed.

## 3. Verify

Do not use `vp run -r` or `vp run -t`. `-t` runs a package and the packages it
depends on, which is the wrong direction: the tests that import a change live
in its dependents. Vitest's `related` follows that import graph
([`vitest related`](https://vitest.dev/guide/cli.html#vitest-related)).

The landing diff is `git diff --name-only origin/main` (committed and unstaged)
plus untracked files (`git ls-files --others --exclude-standard`). When
`origin/main` does not exist yet, the diff is the files about to be committed.
A path belongs to the nearest ancestor directory, other than the repository
root, that contains a `package.json`. Root files select nothing. An empty set
is success: say that no package changed and do not substitute a
repository-wide run.

Build only those packages, and only when `scripts.build` exists. Repeat
`--filter` once per package:

```bash
vp run --fail-if-no-match --filter <name> build
```

Test with `related`, not by running each package's whole suite. Pass the
absolute paths of the changed `*.ts`, `*.tsx`, `*.js`, and `*.mjs` files.
`--filter ...<name>` is the changed package plus the packages that depend on
it; packages without `scripts.test` are skipped by `vp run`. One `--filter` per
changed package:

```bash
vp run --fail-if-no-match --filter ...<name> test -- related <files> --run --passWithNoTests
```

`--run` is required so Vitest does not stay in watch mode. A package whose
graph does not import those files exits 0 because of `--passWithNoTests`. Skip
the test command when the diff has no source files of those extensions.

Any other failure — a failing test, a failing build, a filter that matched
nothing — stops the landing. Never treat a started, pending, or partial run as
success.

## 4. Commit

- `git add -A`; `.gitignore` keeps `node_modules`, `dist`, and similar output
  out of the commit.
- Commit on the current branch (`main`) with a message describing the landed
  change. No signing, CLA, or contributor-agreement step is configured.

## 5. Push

- `origin/main` absent: `git push -u origin main`.
- `origin/main` present and fast-forwardable: `git push origin main`.
- If the push is rejected only because `main` has moved on the remote, merge it
  in and push again; a stale branch is not a reason to stop.
- If `main` is protected against direct pushes, push a branch and open a pull
  request with `gh pr create` instead. Check first with
  `gh api repos/OpenInsightDev/trajs/branches/main/protection`.
- Never force-push.

## 6. Confirm

- `git ls-remote origin refs/heads/main` (or the pushed branch) reports the new
  commit.
- Report the target branch and commit; state plainly if the change did not land.

## Divergence

A remote that has advanced is not a conflict: merge it in (`git merge
origin/main`), re-run Verify on the packages that differ from `origin/main`,
and land. Stop only when git reports a conflict it cannot merge, or when those
checks fail. Never force-push.

## Gates

Stop and report without bypassing when: `origin` is not the expected repository;
a `related` test or a changed package's `build` fails for a reason other than
having no test files; a merge needs a conflict resolved by hand; the push is rejected for
a reason other than the remote having advanced; or the scope of the change is
ambiguous.
