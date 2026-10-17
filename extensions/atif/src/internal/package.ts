/**
 * The name of this package, which every tag it states is namespaced by.
 *
 * A tag names the package that states a datum: the extra data of a part and the events
 * of a kit are keyed by it, so a reader reads back what the kit it installs declares of
 * the name the datum was written under. The name `package.json` states is pinned as the
 * literal it is here, because a TypeScript reading of that file types its strings as
 * `string`, and a tag built of `string` is a pattern — any name ending the way its id
 * does — rather than the name a reader writes and a kit keys.
 */

import pkg from "../../package.json" with { type: "json" };

// SAFETY: the name a package is published under is stated by its own `package.json` and
// is a literal there; TypeScript widens it only because the file is read as JSON, so
// what is asserted is the name that file holds rather than one of another package.
export const packageName = pkg.name as "@trajs/extension-atif";
