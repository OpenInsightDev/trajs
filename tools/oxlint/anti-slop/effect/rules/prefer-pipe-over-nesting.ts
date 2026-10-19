import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

/** Calls in one straight line before the nesting is reported as hard to read. */
const MINIMUM_CHAIN_LENGTH = 3;

/** Whether the call is a `.pipe(...)` application, which already reads left to right. */
function isPipeApplication(node: ESTree.CallExpression): boolean {
	return (
		node.callee.type === "MemberExpression" &&
		!node.callee.computed &&
		node.callee.property.type === "Identifier" &&
		node.callee.property.name === "pipe"
	);
}

/**
 * The call whose result this call builds on: the first argument, when that
 * argument is itself a call. A `.pipe(...)` application ends the chain rather
 * than continuing it — a pipeline is what this rule asks for, so its stages are
 * not nesting — and later arguments do not interrupt it: a step can take them as
 * a curried call.
 */
function valueInward(node: ESTree.CallExpression): ESTree.CallExpression | undefined {
	// Optional calls and type arguments have no `.pipe(...)` spelling, so a chain
	// that runs through one is left alone rather than rewritten.
	if (node.optional || node.typeArguments != null) return undefined;
	if (isPipeApplication(node)) return undefined;
	const [first] = node.arguments;
	return first?.type === "CallExpression" ? first : undefined;
}

/** Whether the surrounding call continues this value's chain, which that call reports instead. */
function isValueOfCaller(node: ESTree.CallExpression): boolean {
	const parent = node.parent;
	return parent.type === "CallExpression" && valueInward(parent) === node;
}

/**
 * Whether a step reads the piped value the way the nested call did: a bare
 * function reference, or a namespace member such as `Stream.map`. A method on a
 * lowercase receiver (`parts.push`) can depend on `this`, which `.pipe(...)`
 * would not carry over.
 */
function isStepReference(callee: ESTree.Expression): boolean {
	if (callee.type === "Identifier") return true;
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		/^[A-Z]/u.test(callee.object.name) &&
		callee.property.type === "Identifier"
	);
}

/** Read a call chain inside out as a staged `.pipe(...)` pipeline instead. */
export const preferPipeOverNestingRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description: "Read a nested call chain as a staged `.pipe(...)` pipeline.",
		},
		hasSuggestions: true,
		messages: {
			deepNesting:
				"This value is nested {{depth}} calls deep, so the order of operations reads inside out. Build it in stages: `value.pipe(stepOne, stepTwo)` — or `pipe(value, ...)` when the value has no `.pipe` of its own. One `.pipe(...)` per logical stage keeps the chain readable: `trajectory.pipe(Stream.map(step)).pipe(Stream.runCollect)` transforms a stream, then runs it.{{curried}}",
			rewriteAsPipe: "Build the value in stages with `.pipe(...)`.",
		},
	},
	create(context) {
		const { sourceCode } = context;

		/**
		 * The step a chain member becomes: its own curried call, carrying the
		 * arguments that followed the value. `undefined` means the step cannot be
		 * rebuilt as text — a method on a lowercase receiver (`parts.push`) may depend
		 * on `this`, and re-flowing a multi-line argument would drop its layout and
		 * any comment inside it.
		 */
		function stepsOf(call: ESTree.CallExpression): string[] | undefined {
			const passed = call.arguments.slice(1).map((argument) => sourceCode.getText(argument));
			if (passed.some((text) => text.includes("\n"))) return undefined;
			if (!isStepReference(call.callee)) return undefined;

			const name = sourceCode.getText(call.callee);
			return [passed.length === 0 ? name : `${name}(${passed.join(", ")})`];
		}

		return {
			CallExpression(node) {
				if (valueInward(node) === undefined || isValueOfCaller(node)) return;

				const chain: ESTree.CallExpression[] = [node];
				let value = node;
				for (;;) {
					const next = valueInward(value);
					if (next === undefined) break;
					chain.push(next);
					value = next;
				}
				if (chain.length < MINIMUM_CHAIN_LENGTH) return;

				// The chain reads outer to inner; a step is every call the value passes
				// through on its way out, innermost first.
				const members = chain.slice(0, -1).reverse();
				const groups = members.map(stepsOf);
				const curried = members.findIndex(
					(call, index) => groups[index] !== undefined && call.arguments.length > 1,
				);
				const rewritten = groups.every((group) => group !== undefined)
					? `${sourceCode.getText(value)}.pipe(${groups.flat().join(", ")})`
					: undefined;

				context.report({
					node,
					messageId: "deepNesting",
					data: {
						depth: String(chain.length),
						curried:
							curried === -1 || groups[curried] === undefined
								? ""
								: ` A step that was given other arguments takes them along in the curried call: \`value.pipe(${groups[curried][0]})\`.`,
					},
					suggest:
						rewritten === undefined
							? undefined
							: [
									{
										messageId: "rewriteAsPipe",
										fix: (fixer) => fixer.replaceText(node, rewritten),
									},
								],
				});
			},
		};
	},
});
