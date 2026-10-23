# Versioning

- `@trajs/*` packages share one version through the `fixed` group in `config.json`. The group covers `packages/` and `apps/cli`. The CLI reads the format the libraries write, so the two move together. Packages under `extensions/` version independently.
- Libraries under `ui/` are never published. They stay `private` and are consumed from source. `ignore` in `config.json` keeps them out of versioning, so a new `ui/` library needs no changeset.
- Every package publishes as an `alpha` prerelease. `pre.json` holds Changesets in pre mode. `changeset version` keeps the `X.Y.Z-alpha.N` line. `changeset pre exit` leaves pre mode.
