---
"@trajs/core": minor
---

The sessions of a trajectory are read as the tree they were forked into, and each
tree of it holds the session it places.

`@trajs/core/SessionTree` states that tree: one session — the main session at its
root — with the sessions forked off it under it, each holding the session it places
rather than the id to look one up by. `SessionTree.make(sessions)` reads the sessions
`Session.toSessions` read as that tree, `SessionTree.dfs(tree)` reads them a session
before the sessions forked off it, `SessionTree.sessionIds(tree)` the ids of that walk,
and `SessionTree.forksOf(id)(tree)` the sessions forked directly off one of them.

A tree is a reading of the sessions rather than something a program keeps of them: what
a session ran on is part of it. The schema `SessionTree.SessionTree(config)` and the
`SessionTree.SessionTreeEncoded` it wrote are gone with the plain tree they read and
wrote.
