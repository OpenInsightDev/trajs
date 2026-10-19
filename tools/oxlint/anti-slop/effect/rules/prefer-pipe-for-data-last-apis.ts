import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

/**
 * Effect's data-last APIs on the computation data types: each takes a program as
 * its only argument and runs it, finishes it, or reshapes it, so
 * `Effect.runPromise(program)` and `program.pipe(Effect.runPromise)` are the same
 * call — and only the second keeps the program in front, where a chain starts.
 *
 * `../scripts/list-data-last-apis.mjs` prints this table from the installed
 * declarations: an API belongs here when it has exactly one call signature, so no
 * `dual` data-first form, and exactly one required parameter of its module's own
 * type. That test leaves out `dual` APIs (`Effect.map`, `Effect.provide`) and
 * thunks (`Effect.suspend`); the data structures (`Option`, `Result`, `Chunk`)
 * are outside the scope this rule covers, as UPSTREAM.md records.
 */
const DATA_LAST_APIS = new Set([
	// `Effect`
	"Effect.acquireDisposable",
	"Effect.asSome",
	"Effect.asVoid",
	"Effect.awaitAllChildren",
	"Effect.cached",
	"Effect.catchNoSuchElement",
	"Effect.eventually",
	"Effect.exit",
	"Effect.flatten",
	"Effect.flip",
	"Effect.head",
	"Effect.interruptible",
	"Effect.isFailure",
	"Effect.isSuccess",
	"Effect.option",
	"Effect.orDie",
	"Effect.result",
	"Effect.runCallback",
	"Effect.runFork",
	"Effect.runPromise",
	"Effect.runPromiseExit",
	"Effect.runSync",
	"Effect.runSyncExit",
	"Effect.sandbox",
	"Effect.scoped",
	"Effect.timed",
	"Effect.transposeOption",
	"Effect.tx",
	"Effect.uninterruptible",
	// `Stream`
	"Stream.accumulate",
	"Stream.changes",
	"Stream.chunks",
	"Stream.collect",
	"Stream.drain",
	"Stream.encodeText",
	"Stream.flattenArray",
	"Stream.flattenIterable",
	"Stream.flattenTake",
	"Stream.forever",
	"Stream.mkArrayBuffer",
	"Stream.mkString",
	"Stream.mkUint8Array",
	"Stream.orDie",
	"Stream.result",
	"Stream.runCollect",
	"Stream.runCount",
	"Stream.runDrain",
	"Stream.runHead",
	"Stream.runLast",
	"Stream.runSum",
	"Stream.scoped",
	"Stream.splitLines",
	"Stream.toAsyncIterable",
	"Stream.toAsyncIterableEffect",
	"Stream.toChannel",
	"Stream.toPull",
	"Stream.unwrap",
	"Stream.zipWithIndex",
	"Stream.zipWithNext",
	"Stream.zipWithPrevious",
	"Stream.zipWithPreviousAndNext",
	// `Channel`
	"Channel.drain",
	"Channel.flatten",
	"Channel.flattenArray",
	"Channel.flattenTake",
	"Channel.forever",
	"Channel.mkUint8Array",
	"Channel.orDie",
	"Channel.runCollect",
	"Channel.runCount",
	"Channel.runDrain",
	"Channel.runHead",
	"Channel.runLast",
	"Channel.scoped",
	"Channel.toPull",
	"Channel.toTransform",
	"Channel.unwrap",
	// `Sink`
	"Sink.ignoreLeftover",
	"Sink.toChannel",
	"Sink.unwrap",
	"Sink.withDuration",
	// `Layer`
	"Layer.build",
	"Layer.fresh",
	"Layer.launch",
	"Layer.orDie",
	"Layer.unwrap",
]);

/**
 * Expressions that keep their meaning when `.pipe(...)` is appended to them. A
 * lower-precedence one — `a ? b : c`, `a || b`, `x as T` — would bind wrongly,
 * and an arrow function's body would swallow the `.pipe(...)`.
 */
const POSTFIX_SAFE = new Set([
	"ArrayExpression",
	"CallExpression",
	"Identifier",
	"MemberExpression",
	"NewExpression",
	"ObjectExpression",
	"ParenthesizedExpression",
	"TaggedTemplateExpression",
	"TemplateLiteral",
]);

/** The `Namespace.member` this call applies, when it is one of the APIs above. */
function dataLastApiCalled(callee: ESTree.Expression): string | undefined {
	if (callee.type !== "MemberExpression" || callee.computed) return undefined;
	if (callee.object.type !== "Identifier") return undefined;
	if (callee.property.type !== "Identifier") return undefined;

	const name = `${callee.object.name}.${callee.property.name}`;
	return DATA_LAST_APIS.has(name) ? name : undefined;
}

/** Apply Effect's data-last APIs as `.pipe(...)` stages so a chain keeps its order. */
export const preferPipeForDataLastApisRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description: "Apply Effect's data-last APIs as `.pipe(...)` stages, not as calls.",
		},
		hasSuggestions: true,
		messages: {
			calledApi:
				"Apply `{{name}}` as a `.pipe(...)` stage instead of a call: write `value.pipe({{name}})`. A `.pipe(...)` chain reads left to right and keeps the value it starts from in front of every stage, instead of nesting it inside the call.",
			applyAsPipe: "Apply `{{name}}` as a `.pipe(...)` stage.",
		},
	},
	create(context) {
		const { sourceCode } = context;

		/**
		 * The value this call should have been applied to as a `.pipe(...)` stage,
		 * or `undefined` when that cannot be written as text: a call with type
		 * arguments or an optional chain has no `.pipe(...)` spelling, one `.pipe(...)`
		 * cannot be appended to every expression, and the rewrite would drop a comment
		 * written beside the value.
		 */
		function pipedValue(node: ESTree.CallExpression): string | undefined {
			if (node.optional || node.typeArguments != null) return undefined;
			if (node.parent.type === "ChainExpression") return undefined;

			const [value] = node.arguments;
			if (value === undefined || !POSTFIX_SAFE.has(value.type)) return undefined;

			const written = sourceCode.getText(value);
			const whole = sourceCode.getText(node);
			const offset = value.range[0] - node.range[0];
			const wrapper = whole.slice(0, offset) + whole.slice(offset + written.length);
			if (wrapper.includes("//") || wrapper.includes("/*")) return undefined;

			return `${written}.pipe(${sourceCode.getText(node.callee)})`;
		}

		return {
			CallExpression(node) {
				// A stage carries the value alone, so only a call that hands it over on its
				// own has a `.pipe(...)` spelling to prefer; anything else stays a call.
				if (node.arguments.length !== 1) return;

				const name = dataLastApiCalled(node.callee);
				if (name === undefined) return;

				const rewritten = pipedValue(node);
				context.report({
					node,
					messageId: "calledApi",
					data: { name },
					suggest:
						rewritten === undefined
							? undefined
							: [
									{
										messageId: "applyAsPipe",
										data: { name },
										fix: (fixer) => fixer.replaceText(node, rewritten),
									},
								],
				});
			},
		};
	},
});
