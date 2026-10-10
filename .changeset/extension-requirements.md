---
"@trajs/core": minor
---

`Extension` now declares the services a producer of its data needs, the way `Tool`
declares the services its handler needs. `Extension.make` takes a `dependencies`
option, `Extension.Requirements<Ext>` reads what an extension declares, and
`extension.addDependency(tag)` adds one more service to it.

The requirements are phantom: no field of an extension depends on them and
nothing reads them at runtime, so an extension is still the identifier, metadata
and line of versions it was built from, and data already recorded for it is
unaffected. They are covariant, so an extension that declares none is usable
where one that declares some is expected.

`Extension.upgrade` carries the declared services into the derived version, and
`Extension.Any` reads them as unknown, so any extension is one.
