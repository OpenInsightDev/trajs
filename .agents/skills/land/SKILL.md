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
blockers listed under Gates and Conflicts.

## 1. Preflight (read-only)

- `git remote -v`: the landing target is `origin`. If `origin` is missing or
  points somewhere else, stop and report instead of guessing.
- `git status --short --branch`: note the current branch and the uncommitted and
  untracked work; that work is what lands.
- `git fetch origin` then `git rev-parse --verify origin/main`: find out whether
  the remote already has `main`. A brand-new remote has none, and the first
  landing creates it.

## 2. Comment pass (required)

Before committing, apply the rules in `.agents/skills/clear-comments/SKILL.md` to
the files being landed: delete filler comments and comments that restate what the
code already makes clear, keep only comments that explain why, and leave the
public API documentation alone. Report what was removed. This runs before the
checks so the verified artifact is what gets pushed.

## 3. Verify

Run the repository's own aggregate check from the repo root:

```bash
vp run ready
```

`package.json` defines `ready` as `vp check && vp run -r test && vp run -r build`.
There is no CI workflow, so this run is the required verification: every step
must pass before landing. Do not substitute a different command. If a step fails,
fix it or stop and report; never treat started, pending, partial, or failing
checks as success.

## 4. Commit

- `git add -A`; `.gitignore` keeps `node_modules`, `dist`, and similar output
  out of the commit.
- Commit on the current branch (`main`) with a message describing the landed
  change. No signing, CLA, or contributor-agreement step is configured.

## 5. Push

- `origin/main` absent: `git push -u origin main`.
- `origin/main` present and fast-forwardable: `git push origin main`.
- If `main` is protected against direct pushes, push a branch and open a pull
  request with `gh pr create` instead. Check first with
  `gh api repos/OpenInsightDev/trajs/branches/main/protection`.
- Never force-push.

## 6. Confirm

- `git ls-remote origin refs/heads/main` (or the pushed branch) reports the new
  commit.
- Report the target branch and commit; state plainly if the change did not land.

## Conflicts

Preference: pause and report. On divergence or conflict, do not auto-resolve and
do not force-push. Report the conflicting refs and wait for the user's decision.

## Gates

Stop and report without bypassing when: `origin` is not the expected repository;
`vp run ready` fails; the remote rejects the push; `main` is protected and pull
request creation is unavailable; or the scope of the change is ambiguous.
