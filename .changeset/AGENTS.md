# Versioning

- Only the core libraries under `packages/` are published for now. Core libraries are one Changesets `fixed` release group and always share one version (refer to `effect` release strategy).
- Every other library stays out of the release for now.
- Every published package ships as an `alpha` prerelease for now. `pre.json` holds Changesets in pre mode. `changeset version` keeps the `X.Y.Z-alpha.N` line.
- Any change to the public surface ships a `minor` changeset, which moves the alpha minor line: an export or a public type added, changed, or removed. A change that breaks a `stable` export lands this way too while the packages are `alpha`.
- Each public export carries its own `@stability`:
  - A `stable` export breaks only on a major of the whole core group.
  - An `experimental` export may break on a minor.
  - Removing a `deprecated` export that was `stable` is still a major.
- A library outside `packages/` keeps its independent semver. It declares each core library it needs in `peerDependencies`, with the core version range it supports.
- A pull request publishes snapshot builds of the publishable packages with [pkg-pr-new](https://github.com/stackblitz-labs/pkg.pr.new).
