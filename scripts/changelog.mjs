// States the release note of a package: what Changesets writes into its
// `CHANGELOG.md`, and from there what the release workflow publishes as the body
// of the package's GitHub release.
//
// The core libraries under `packages/` are one `fixed` release group
// (`.changeset/AGENTS.md`), so a release moves all six of them to one version,
// and a changeset often lists several of them. `@changesets/changelog-github`
// renders the dependency updates of such a release as
// `Updated dependencies [`a1b2c3d`, `d4e5f6a`]:` over the dependencies that
// moved, and in this group that list restates the note it sits under: a
// changeset that lists a package and one of its dependencies is rendered once as
// the package's own entry and once as the commit of the dependency, and a commit
// that carried two changesets is named once per changeset. The list is also
// empty — `Updated dependencies []:` — whenever every change of the release
// belongs to another package, which is most of the notes a release writes.
//
// A note states each change once, so the dependency line names the dependencies
// that moved and leaves their commits to the notes those dependencies carry at
// this same version. `getReleaseLine` stays the generator's own, so a change is
// still rendered from its changeset as before.

import changelogGithub from "@changesets/changelog-github";

export default {
  getReleaseLine: changelogGithub.getReleaseLine,

  // The commits of `changesets` are the ones the note above already states,
  // which is why the line carries none of them.
  getDependencyReleaseLine: (changesets, dependenciesUpdated) => {
    if (dependenciesUpdated.length === 0) return "";

    return [
      "- Updated dependencies:",
      ...dependenciesUpdated.map((dependency) => `  - ${dependency.name}@${dependency.newVersion}`),
    ].join("\n");
  },
};
