# Examples

Examples are optional. Keep or add one only for behavior not evident from the signature, meaningful composition, or useful inference or narrowing. Replace or remove examples that are trivial, misleading, contrived, or scaffolding-heavy.

Use `**Example** (Unique use-case title)`, optional prose, and exactly one non-empty `ts` fence, marked `import.meta.vitest` when the example runs. Titles must remain unique after trimming and lowercasing. Do not use `@example` tags or loose `ts` fences.

Examples use public imports and read as setup, operation, then semantic observation. A runnable example must run as written. Prefer a direct assertion with a trailing `// =>` and the actual result. Keep the call and assertion on one line when it fits, and format expected arrays densely. Separate a later assertion block with a blank line.

- Import from the published entry point of the package, such as `@trajs/core` or `@trajs/utils/Compression`. Do not import `#/internal/*`.
- Await asynchronous work. Use `Effect.runPromise`; use `Effect.runSync` only when synchronous execution is the documented contract.
- Use `Ref`, `Deferred`, or `Queue` rather than mutable probes for concurrency, interruption, or races.
- Keep type-level examples marked without tautological runtime assertions.
- Leave examples that register tests and intentionally non-executable examples as plain `ts` fences.

An example is part of the contract: it shows the behavior described above, not only a happy-path call. If example research suggests an implementation or type bug, report it instead of changing runtime code during a documentation-only pass.
