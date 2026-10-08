import { expect, it } from "vite-plus/test";
import { Effect } from "effect";

it("runs an Effect", async () => {
  const value = await Effect.runPromise(Effect.succeed(42));
  expect(value).toBe(42);
});
