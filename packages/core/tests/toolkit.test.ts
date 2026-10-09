import { expect, it } from "vite-plus/test";
import { Effect, Schema, Stream } from "effect";
import { Tool, Toolkit } from "effect/ai";
import * as Extensionkit from "#/Extensionkit.ts";
import * as Response from "#/Response.ts";
import * as Trajectory from "#/Trajectory.ts";
import * as TrajectoryToolkit from "#/Toolkit.ts";

const weather = Toolkit.make(
  Tool.make("get_weather", {
    parameters: Schema.Struct({ city: Schema.String }),
    success: Schema.Struct({ temp: Schema.Number }),
  }),
);

const call = (id: string, name = "get_weather") =>
  Response.anyToolCallPart({ id, name, params: { city: "SF" }, providerExecuted: false });

const result = (id: string, options: { name?: string; preliminary?: boolean } = {}) =>
  Response.anyToolResultPart({
    id,
    name: options.name ?? "get_weather",
    isFailure: false,
    result: { temp: 22 },
    encodedResult: { temp: 22 },
    providerExecuted: false,
    preliminary: options.preliminary ?? false,
  });

const turnsOf = Effect.fn(function* (parts: ReadonlyArray<Trajectory.AnyPart>) {
  const recorded = Trajectory.make(Stream.fromIterable(parts), Toolkit.empty, Extensionkit.empty);
  const bound = yield* TrajectoryToolkit.toolkits(weather)(recorded);
  const turns = yield* Stream.runCollect(TrajectoryToolkit.toolTurns(bound));

  return Array.from(turns);
});

it("pairs a recorded tool call with its result", async () => {
  const turns = await Effect.runPromise(
    turnsOf([Trajectory.responsePart(call("c1")), Trajectory.responsePart(result("c1"))]),
  );

  expect(turns).toHaveLength(1);
  expect(turns[0].call.id).toBe("c1");
  expect(turns[0].call.params.city).toBe("SF");
  expect(turns[0].result).toMatchObject({ id: "c1", result: { temp: 22 } });
});

it("follows the results when several calls are outstanding", async () => {
  const turns = await Effect.runPromise(
    turnsOf([
      Trajectory.responsePart(call("c1")),
      Trajectory.responsePart(call("c2")),
      Trajectory.responsePart(result("c2")),
      Trajectory.responsePart(result("c1")),
    ]),
  );

  expect(turns.map((turn) => turn.call.id)).toEqual(["c2", "c1"]);
});

it("completes a turn with the final result only", async () => {
  const turns = await Effect.runPromise(
    turnsOf([
      Trajectory.responsePart(call("c1")),
      Trajectory.responsePart(result("c1", { preliminary: true })),
      Trajectory.responsePart(result("c1")),
    ]),
  );

  expect(turns).toHaveLength(1);
  expect(turns[0].result.preliminary).toBe(false);
});

it("drops a call whose result was never recorded", async () => {
  const turns = await Effect.runPromise(turnsOf([Trajectory.responsePart(call("c1"))]));

  expect(turns).toEqual([]);
});

it("skips results that answer a call outside the toolkit", async () => {
  const turns = await Effect.runPromise(
    turnsOf([
      Trajectory.responsePart(call("c1")),
      Trajectory.responsePart(call("c2", "mystery_tool")),
      Trajectory.responsePart(result("c1")),
      Trajectory.responsePart(result("c2", { name: "mystery_tool" })),
    ]),
  );

  expect(turns.map((turn) => turn.call.id)).toEqual(["c1"]);
});
