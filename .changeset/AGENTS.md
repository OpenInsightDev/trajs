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
- Releases are cut on a cadence, not per change. While the packages are `alpha`, a maintainer merges the open "Version Packages" pull request every other day, and each merge is one release. Changesets accumulate on that pull request in between, so a release carries everything that landed since the last one and the `fixed` group still moves a single `alpha` version. Nothing merges it automatically: when a release ships stays a decision a maintainer makes.
- A change does not have to wait for that: every push publishes a snapshot of the publishable packages with [pkg-pr-new](https://github.com/stackblitz-labs/pkg-pr-new), linked from the branch's pull request, which installs like a release.
