/**
 * Prints the `DATA_LAST_APIS` table of `prefer-pipe-for-data-last-apis` from the
 * Effect declarations this repo installs, to be pasted over that table after an
 * Effect upgrade:
 *
 *     node tools/oxlint/anti-slop/effect/scripts/list-data-last-apis.mjs
 *
 * An API is listed when its declaration has exactly one call signature, so it has
 * no `dual` data-first form, and exactly one required parameter that is a single
 * value of the module's own data type — the value whose `.pipe(...)` the caller
 * would otherwise bypass. That test discards thunks (`LazyArg<…>`), implementation
 * objects (`Omit<…>`, `Partial<…>`), the unions a type guard takes, and containers
 * (`Iterable<…>`, `Array<…>`, `Record<…>`), which have no `.pipe(...)` of their
 * own. Only the computation data types are printed; UPSTREAM.md records why the
 * scope stops there and what extending it would catch.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MODULES = ["Effect", "Stream", "Channel", "Sink", "Layer"];

const OPEN = "<([{";
const CLOSE = ">)]}";

/** Split `text` on `separator`, ignoring separators inside brackets and `=>`. */
function splitTopLevel(text, separator) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (character === "=" && text[index + 1] === ">") {
			index += 1;
			continue;
		}
		if (OPEN.includes(character)) depth += 1;
		else if (CLOSE.includes(character)) depth -= 1;
		else if (character === separator && depth === 0) {
			parts.push(text.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(text.slice(start));
	return parts;
}

/** The type written after `name:` at `from`, up to the `;` that ends the declaration. */
function declarationType(source, from) {
	let depth = 0;
	for (let index = from; index < source.length; index += 1) {
		const character = source[index];
		if (character === "=" && source[index + 1] === ">") {
			index += 1;
			continue;
		}
		if (OPEN.includes(character)) depth += 1;
		else if (CLOSE.includes(character)) depth -= 1;
		else if (character === ";" && depth === 0) return source.slice(from, index);
	}
	return source.slice(from);
}

/** Call signatures of a declaration type: `{ <A>(f): …; <A>(self, f): … }` or `<A>(self) => …`. */
function callSignatures(type) {
	const text = type.trim();
	if (!text.startsWith("{")) return [text];
	return splitTopLevel(text.slice(1, text.lastIndexOf("}")), ";")
		.map((signature) => signature.trim())
		.filter((signature) => signature !== "");
}

/** Parameters of one call signature, split at the top level. */
function parameters(signature) {
	const start = signature.indexOf("(");
	if (start === -1) return [];
	let depth = 0;
	for (let index = start; index < signature.length; index += 1) {
		const character = signature[index];
		if (character === "=" && signature[index + 1] === ">") {
			index += 1;
			continue;
		}
		if (OPEN.includes(character)) depth += 1;
		else if (CLOSE.includes(character)) {
			depth -= 1;
			if (depth === 0) {
				return splitTopLevel(signature.slice(start + 1, index), ",")
					.map((parameter) => parameter.trim())
					.filter((parameter) => parameter !== "");
			}
		}
	}
	return [];
}

/** The `dist` directory of the installed Effect package. */
function effectDist() {
	const [, , scriptArgument] = process.argv;
	if (scriptArgument !== undefined) return scriptArgument;

	const store = "node_modules/.pnpm";
	const installed = readdirSync(store)
		.filter((entry) => entry.startsWith("effect@"))
		.sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
		.at(-1);
	if (installed === undefined) {
		throw new Error(`No Effect install under ${store}; pass its dist directory as an argument.`);
	}
	return join(store, installed, "node_modules/effect/dist");
}

/** The names each module exports whose call form a `.pipe(...)` stage should replace. */
function dataLastApis(dist) {
	const found = {};
	for (const module of MODULES) {
		const source = readFileSync(join(dist, `${module}.d.ts`), "utf8").replace(/\/\*\*[\s\S]*?\*\//gu, "");
		const names = [];
		for (const match of source.matchAll(/export declare const ([A-Za-z0-9_$]+):[^;{]/gu)) {
			const signatures = callSignatures(
				declarationType(source, match.index + match[0].length - 1),
			);
			if (signatures.length !== 1) continue;
			const [signature] = signatures;
			if (!signature.includes("=>")) continue;

			const required = parameters(signature).filter(
				(parameter) =>
					!/^\s*[A-Za-z0-9_$]+\s*\?/u.test(parameter) && !parameter.startsWith("..."),
			);
			if (required.length !== 1) continue;
			const [parameter] = required;
			if (parameter.includes("=>")) continue;

			const type = parameter.slice(parameter.indexOf(":") + 1).replace(/\s+/gu, " ").trim();
			if (!new RegExp(`\\b${module}\\b`, "u").test(type)) continue;
			if (/\bLazyArg<|\bOmit<|\bPartial</u.test(type)) continue;
			if (splitTopLevel(type, "|").length > 1) continue;
			if (/^(?:Iterable|ReadonlyArray|Array|Record)</u.test(type)) continue;
			names.push(`${module}.${match[1]}`);
		}
		found[module] = names.sort((left, right) => left.localeCompare(right, "en"));
	}
	return found;
}

/** The table body, ready to paste between `new Set([` and `])`. */
function table(apis) {
	return MODULES.flatMap((module) => [
		`\t// \`${module}\``,
		...apis[module].map((name) => `\t"${name}",`),
	]).join("\n");
}

const dist = effectDist();
console.error(`Reading declarations from ${dist}`);
console.log(table(dataLastApis(dist)));
