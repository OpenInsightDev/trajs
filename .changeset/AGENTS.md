# Versioning

- A package that is not published stays `private` and is not versioned. It takes no changeset. `privatePackages` is `false`, and `ignore` in `config.json` lists `@trajs/ui-*`.
- Every library under `packages/` is a core library. Core libraries are one Changesets `fixed` release group and always share one version, the way `effect` and the `@effect/*` packages do.
- The shared version does not describe a single API. Each public export carries its own `@stability`. A `stable` export breaks only on a major of the whole core group. An `experimental` export may break on a minor. Removing a `deprecated` export that was `stable` is still a major.
- A published library outside `packages/`, including every library under `extensions/` and `@trajs/cli`, keeps its own semver. It is not a member of the core `fixed` group.
- That library declares each core library it needs in `peerDependencies`, with the core version range it supports. It does not take those libraries as `dependencies`.
- Every published package ships as an `alpha` prerelease. `pre.json` holds Changesets in pre mode. `changeset version` keeps the `X.Y.Z-alpha.N` line. `changeset pre exit` leaves pre mode.
- A pull request publishes snapshot builds of the publishable packages with [pkg-pr-new](https://github.com/stackblitz-labs/pkg.pr.new). A snapshot is not a release. It does not bump the version Changesets tracks. Install one as `https://pkg.pr.new/<package>@<pull-request>`.
