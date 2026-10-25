/**
 * The name of this package, which every tag it states is namespaced by.
 */

import pkg from "../../package.json" with { type: "json" };

// SAFETY: the name a package is published under is stated by its own `package.json` and
// is a literal there; TypeScript widens it only because the file is read as JSON, so
// what is asserted is the name that file holds rather than one of another package.
export const packageName = pkg.name as "@trajs/extension-atif";
