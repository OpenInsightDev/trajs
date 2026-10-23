---
"@trajs/core": minor
---

The sessions of a trajectory are read as the tree they were forked into.

`@trajs/core/SessionTree` states that tree: it is one session — the main session at its root —
holding the trees of the sessions forked off it, each beside the id it is named by and the extra
data its declaration states. What a session ran on is not part of it, so a tree is read without
reading any part of a trajectory again.

`SessionTree.fromSessions(sessions)` reads the sessions `Session.toSessions` read as that tree.
`SessionTree.sessionIds(tree)` walks a tree in the order it was forked into, and
`SessionTree.forksOf(id)(tree)` reads the sessions forked directly off one of them.

`SessionTree.SessionTree(config)` is the schema of that tree, as the extra kit of a config reads it,
so a tree is written where a program keeps one and read back.
