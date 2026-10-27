/**
 * What this package states of itself, which every declaration it makes states again.
 */

import type { PackageMetadata } from "#/Package.ts";

import packageJson from "../../../../package.json" with { type: "json" };

/**
 * The name every tag this module states is namespaced by.
 *
 * Written out rather than read from `package.json`, which widens it to a string.
 */
export const packageName = "@trajs/core";

/** The package every declaration this module states is in. */
export const packageMetadata: PackageMetadata = packageJson;
