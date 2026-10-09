---
"@trajs/core": patch
---

Build a line of versions recursively. `Versions.upgrade` wrapped every member of the
version before it, so a version held one reader per version below it and a line of
N versions held N(N+1)/2 readers; it now wraps the whole reader of the version
before it in one step, so a version holds two readers and a line of N versions
holds O(N). Reading every version up to the newest into the newest value, and
encoding only the newest, are unchanged, and `Versions.across` still reads two
lines at once.

The `Upgrade` type is replaced by `Step`. A document whose `version` matches no
version of the line is now reported against the innermost versions rather than all
of them, because `Schema.Union` cannot see through the nested step when it picks
candidates.
