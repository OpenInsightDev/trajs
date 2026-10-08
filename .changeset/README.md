# Changesets

Every user-visible change to a published package needs a changeset. Run
`pnpm exec changeset` from the repository root, choose the bump type and describe
the change; commit the file it writes with the pull request. A tooling change
that should not trigger a release gets an empty changeset instead
(`pnpm exec changeset add --empty`).

`.changeset/config.json` keeps every published package on one version, so a single
changeset moves the whole release. `trajs` is the only published package today;
new packages join the `fixed` group when they are added.

`.github/workflows/release.yml` turns queued changesets into a "Version Packages"
pull request, and publishes once that pull request is merged.
