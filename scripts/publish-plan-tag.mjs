#!/usr/bin/env node
// States the npm tag every release in a Changesets publish plan ships under.
//
// `changeset publish` passes the plan's `tag` to `npm publish`, and when it
// publishes packed tarballs it takes the tag from the plan rather than from the
// command line: `publish-plan` accepts no `--tag`, and `publish` refuses one in
// pre and artifact mode. `select-mode` builds that plan from registry state, and
// in this repo the answer differs per package: `@trajs/core` published a `0.0.0`
// before pre mode, so its prereleases stay off `latest` while the other five go
// there. Rewriting the tag is the only place left to state it once for the whole
// group. `.github/workflows/release.yml` explains the choice of tag.

import { readFile, writeFile } from "node:fs/promises";

const [planPath, tag] = process.argv.slice(2);

if (!planPath || !tag) {
  console.error("usage: publish-plan-tag.mjs <publish-plan.json> <npm-tag>");
  process.exit(1);
}

const plan = JSON.parse(await readFile(planPath, "utf8"));

if (plan?.version !== 1 || !Array.isArray(plan.plan)) {
  console.error(`${planPath} is not a version 1 publish plan`);
  process.exit(1);
}

const releases = plan.plan.flat().filter((release) => release.kind === "publish");

if (releases.length === 0) {
  console.error(`${planPath} holds no package to publish`);
  process.exit(1);
}

for (const release of releases) release.tag = tag;

await writeFile(planPath, `${JSON.stringify(plan, undefined, 2)}\n`);

console.log(`${releases.length} releases will ship under the \`${tag}\` tag`);
