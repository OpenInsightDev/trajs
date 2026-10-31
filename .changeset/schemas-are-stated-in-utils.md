---
"@trajs/utils": minor
"@trajs/core": minor
---

`VersionedSchema` and the schema of a `package.json` are stated in
`@trajs/utils`, beside the services a trajectory is carried through.

`VersionedSchema` keeps its name, so `import { VersionedSchema } from
"@trajs/core"` reads the same module as `@trajs/utils/VersionedSchema`.

The schema of a `package.json` is `Package.PackageMetadata`, where `@trajs/core`
exported `PackageMetadata`. A declaration still states it as its
`packageMetadata`, and `@trajs/core` re-exports `Package` as it re-exports the
other modules of `@trajs/utils`.
