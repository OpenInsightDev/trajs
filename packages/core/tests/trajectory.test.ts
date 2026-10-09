import { expect, it } from "vite-plus/test";
import { Effect, Stream } from "effect";
import { Prompt, Toolkit } from "effect/ai";
import * as Extensionkit from "#/Extensionkit.ts";
import * as Trajectory from "#/Trajectory.ts";

const parts = Stream.make(Trajectory.promptPart(Prompt.make("Hello")));

const collect = (trajectory: Trajectory.Any) => Effect.runPromise(Stream.runCollect(trajectory));

it("attaches a toolkit and metadata to a stream of parts", async () => {
  const trajectory = Trajectory.make(
    parts,
    Toolkit.empty,
    Extensionkit.empty,
    Trajectory.Metadata.make({ name: "greeting" }),
  );

  expect(trajectory.metadata.name).toBe("greeting");
  expect(trajectory.metadata.version).toBe(Trajectory.version);
  expect(trajectory.toolkit).toBe(Toolkit.empty);
  expect(Array.from(await collect(trajectory))).toHaveLength(1);
});

it("binds a stream that was defined before the toolkit", async () => {
  const trajectory = parts.pipe(
    Trajectory.make(
      Toolkit.empty,
      Extensionkit.empty,
      Trajectory.Metadata.make({ name: "greeting" }),
    ),
  );

  expect(trajectory.metadata.name).toBe("greeting");
  expect(trajectory.toolkit).toBe(Toolkit.empty);
  expect(Array.from(await collect(trajectory))).toHaveLength(1);
});

it("gives each part its own identifier", () => {
  const first = Trajectory.promptPart(Prompt.make("Hello"));
  const second = Trajectory.promptPart(Prompt.make("Hello"));

  expect(first.uuid).not.toBe(second.uuid);
});
