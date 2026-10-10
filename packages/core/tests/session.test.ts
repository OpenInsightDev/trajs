import { expect, it } from "vite-plus/test";
import { Effect, Exit, Option, Predicate, Stream } from "effect";
import { Prompt } from "effect/ai";
import * as Persist from "#/Persist.ts";
import * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";

const prompt = (text: string, session?: string) =>
  Trajectory.PromptPart.make({ messages: Prompt.make(text).content, session });

const declaration = (session: string, fork?: string) => Trajectory.sessionPart(session, { fork });

const make = (...parts: ReadonlyArray<Trajectory.AnyPart>) =>
  Trajectory.make(Stream.fromIterable(parts));

const tags = (parts: ReadonlyArray<{ readonly _tag: string }>) => parts.map((part) => part._tag);

const sessionOf = async (trajectory: ReturnType<typeof make>, session: string) =>
  tags(Array.from(await Effect.runPromise(Stream.runCollect(Session.of(session)(trajectory)))));

const parentOf = async (trajectory: ReturnType<typeof make>, session: string) =>
  Option.getOrUndefined(
    await Effect.runPromise(Stream.runHead(Session.parent(session)(trajectory))),
  );

const childrenOf = async (trajectory: ReturnType<typeof make>, session: string) =>
  Array.from(await Effect.runPromise(Stream.runCollect(Session.children(session)(trajectory))));

const allOf = async (trajectory: ReturnType<typeof make>) =>
  Effect.runPromise(Session.all(trajectory));

const read = async (trajectory: Trajectory.Any) =>
  tags(Array.from(await Effect.runPromise(Stream.runCollect(trajectory))));

const attached = (part: Trajectory.AnyPart) =>
  Trajectory.AnyExtensionPart.make({
    extension: { extension: "dev.observerw.otel", data: { spanId: part.uuid } },
    attach: Option.some([part.uuid]),
  });

it("reads a session that declares no fork as having no parent", async () => {
  const trajectory = make(declaration("a"), prompt("Hello", "a"));

  expect(await parentOf(trajectory, "a")).toBeUndefined();
  expect(await sessionOf(trajectory, "a")).toEqual(["Session", "Prompt"]);
});

it("reads the parent of a forked session off the part it continues from", async () => {
  const hello = prompt("Hello", "a");
  const trajectory = make(declaration("a"), hello, declaration("b", hello.uuid));

  expect(await parentOf(trajectory, "b")).toBe("a");
});

it("inherits the parent's parts up to and including the fork point", async () => {
  const hello = prompt("Hello", "a");

  const trajectory = make(
    declaration("a"),
    hello,
    prompt("After the fork", "a"),
    declaration("b", hello.uuid),
    prompt("Continue", "b"),
  );

  expect(await sessionOf(trajectory, "b")).toEqual(["Session", "Prompt", "Session", "Prompt"]);
});

it("reads the children of a session from the edges", async () => {
  const hello = prompt("Hello", "a");

  const trajectory = make(
    declaration("a"),
    hello,
    declaration("b", hello.uuid),
    declaration("c", hello.uuid),
  );

  expect(await childrenOf(trajectory, "a")).toEqual(["b", "c"]);
  expect(await childrenOf(trajectory, "b")).toEqual([]);
});

it("inherits nothing from a fork that names a part the recording does not have", async () => {
  const missing = "01920000-0000-7000-8000-000000000000";
  const trajectory = make(declaration("b", missing), prompt("Continue", "b"));

  expect(await parentOf(trajectory, "b")).toBeUndefined();
  expect(await sessionOf(trajectory, "b")).toEqual(["Session", "Prompt"]);
});

it("reports a cycle instead of following it", async () => {
  const helloA = prompt("Hello", "a");
  const helloB = prompt("Hi", "b");

  // Each edge's target precedes its declaration, so both are resolvable and the
  // cycle between them is what the walk has to reject.
  const trajectory = make(
    helloA,
    declaration("b", helloA.uuid),
    helloB,
    declaration("a", helloB.uuid),
  );

  const exit = await Effect.runPromise(Effect.exit(Stream.runCollect(Session.of("a")(trajectory))));

  expect(Exit.isFailure(exit)).toBe(true);
});

it("reads a session without draining the rest of the recording", async () => {
  const hello = prompt("Hello", "a");

  const trajectory = Trajectory.make(
    Stream.concat(
      // SAFETY: The literal mixes concrete part classes; `AnyPart` is their common
      // recorded type and every element is one of its members.
      Stream.fromIterable([
        declaration("a"),
        hello,
        declaration("b", hello.uuid),
        prompt("Continue", "b"),
      ] as ReadonlyArray<Trajectory.AnyPart>),
      Stream.forever(Stream.make(prompt("Noise", "z"))),
    ),
  );

  const taken = Array.from(
    await Effect.runPromise(Stream.runCollect(Session.of("b")(trajectory).pipe(Stream.take(4)))),
  );

  expect(tags(taken)).toEqual(["Session", "Prompt", "Session", "Prompt"]);
});

it("reads a parent without draining the rest of the recording", async () => {
  const hello = prompt("Hello", "a");

  const trajectory = Trajectory.make(
    Stream.concat(
      // SAFETY: The literal mixes concrete part classes; `AnyPart` is their common
      // recorded type and every element is one of its members.
      Stream.fromIterable([
        hello,
        declaration("b", hello.uuid),
      ] as ReadonlyArray<Trajectory.AnyPart>),
      Stream.forever(Stream.make(prompt("Noise", "z"))),
    ),
  );

  expect(await parentOf(trajectory, "b")).toBe("a");
});

it("selects the parts recorded under one session", async () => {
  const trajectory = make(
    prompt("Hello", "a"),
    prompt("Hi", "b"),
    prompt("Continue", "a"),
    prompt("Unassigned"),
  );

  const selected = Array.from(
    await Effect.runPromise(Stream.runCollect(Session.select("a")(trajectory))),
  );

  expect(tags(selected)).toEqual(["Prompt", "Prompt"]);
  expect(
    selected.map((part) => (Predicate.isTagged("Prompt")(part) ? part.session : undefined)),
  ).toEqual(["a", "a"]);
});

it("reads an extension part under the session of the part it is attached to", async () => {
  const hello = prompt("Hello", "a");
  const hi = prompt("Hi", "b");
  const trajectory = make(declaration("a"), hello, attached(hello), hi, attached(hi));

  const selected = Array.from(
    await Effect.runPromise(Stream.runCollect(Session.select("a")(trajectory))),
  );

  expect(tags(selected)).toEqual(["Session", "Prompt", "Extension"]);
  expect(await sessionOf(trajectory, "a")).toEqual(["Session", "Prompt", "Extension"]);
});

it("streams the session declarations of a trajectory", async () => {
  const trajectory = make(declaration("a"), declaration("b"));

  const declared = Array.from(
    await Effect.runPromise(Stream.runCollect(Session.parts(trajectory))),
  );

  expect(declared.map((part) => part.session)).toEqual(["a", "b"]);
});

it("round-trips a session part through the .trajs codec", async () => {
  const hello = prompt("Hello", "a");
  const trajectory = make(declaration("a"), hello, declaration("b", hello.uuid));

  const records = Array.from(
    await Effect.runPromise(Stream.runCollect(Persist.encode(trajectory))),
  );

  const decoded = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const loaded = yield* Persist.decode(Stream.fromIterable(records));

        return Array.from(yield* Stream.runCollect(loaded));
      }),
    ),
  );

  expect(tags(decoded)).toEqual(["Session", "Prompt", "Session"]);
  expect(Predicate.isTagged("Session")(decoded[2]) && decoded[2].fork).toBe(hello.uuid);
});

it("reads every session of a recording, keyed by identifier", async () => {
  const hello = prompt("Hello", "a");

  const trajectory = make(
    declaration("a"),
    hello,
    prompt("Unassigned"),
    declaration("b", hello.uuid),
    prompt("Continue", "b"),
  );

  const sessions = await allOf(trajectory);

  expect(Object.keys(sessions)).toEqual(["a", "b"]);
  expect(await read(sessions["a"])).toEqual(["Session", "Prompt"]);
  // `b` reads the parts of `a` up to the fork point, then its own.
  expect(await read(sessions["b"])).toEqual(["Session", "Prompt", "Session", "Prompt"]);
});

it("reads a session the way `of` streams it", async () => {
  const hello = prompt("Hello", "a");

  const trajectory = make(
    declaration("a"),
    hello,
    prompt("After the fork", "a"),
    declaration("b", hello.uuid),
    prompt("Continue", "b"),
  );

  const sessions = await allOf(trajectory);

  expect(await read(sessions["b"])).toEqual(await sessionOf(trajectory, "b"));
});

it("reads a session no declaration names", async () => {
  const trajectory = make(prompt("Hello", "a"), prompt("Hi", "b"), prompt("Continue", "a"));

  const sessions = await allOf(trajectory);

  expect(Object.keys(sessions)).toEqual(["a", "b"]);
  expect(await read(sessions["a"])).toEqual(["Prompt", "Prompt"]);
});

it("reads a session with no parts of its own", async () => {
  const trajectory = make(declaration("a"), declaration("b"));

  const sessions = await allOf(trajectory);

  expect(await read(sessions["a"])).toEqual(["Session"]);
  expect(await read(sessions["b"])).toEqual(["Session"]);
});

it("groups an extension part under the session of the part it is attached to", async () => {
  const hello = prompt("Hello", "a");
  const hi = prompt("Hi", "b");
  const trajectory = make(declaration("a"), hello, attached(hello), hi, attached(hi));

  const sessions = await allOf(trajectory);

  expect(await read(sessions["a"])).toEqual(["Session", "Prompt", "Extension"]);
  expect(await read(sessions["b"])).toEqual(["Prompt", "Extension"]);
});

it("carries the recording's metadata and can be read more than once", async () => {
  const trajectory = Trajectory.make(
    Stream.make(declaration("a"), prompt("Hello", "a")),
    Trajectory.Metadata.make({ name: "greeting" }),
  );

  const sessions = await allOf(trajectory);
  const session = sessions["a"];

  expect(session.metadata.name).toBe("greeting");
  expect(await read(session)).toEqual(["Session", "Prompt"]);
  expect(await read(session)).toEqual(["Session", "Prompt"]);
});

it("reports a cycle instead of following it", async () => {
  const helloA = prompt("Hello", "a");
  const helloB = prompt("Hi", "b");

  const trajectory = make(
    helloA,
    declaration("b", helloA.uuid),
    helloB,
    declaration("a", helloB.uuid),
  );

  const exit = await Effect.runPromise(Effect.exit(Session.all(trajectory)));

  expect(Exit.isFailure(exit)).toBe(true);
});
