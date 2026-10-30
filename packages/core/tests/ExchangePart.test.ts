/**
 * The stored form of every part kind, as `internal/exchange/part.ts` states it.
 * Each schema, and all of them read as one union, must have a layout
 * `SchemaBinary` compiles, and a part read back must be the part written.
 */
import {
  Event,
  EventKit,
  Extra,
  ExtraKit,
  Metric,
  MetricKit,
  Prompt,
  Response,
  Toolkit,
  Trajectory,
} from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { DateTime, Effect, Schema, Stream } from "effect";
import { SchemaBinary } from "effect/encoding";
import * as uuid from "uuid";
import { expect, it } from "vite-plus/test";

import {
  EventPart,
  MetricPart,
  PromptPart,
  ResponsePart,
  SessionPart,
} from "#/internal/exchange/part.ts";
import { checkBinaryLayout } from "#/internal/schema.ts";

/** The uuid the session below states, which a metric attaches its result to. */
const sessionId = "01890a5d-ac96-774b-bcce-b302099a8058";

/** The moment the parts below were produced, which each stored epoch states. */
const at = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z");

const note = Extra.make({
  packageName: "test",
  id: "note",
  prompt: Schema.Struct({ text: Schema.String }),
  session: Schema.Struct({ text: Schema.String }),
});

// An extra whose fields the layout holds as they are, so bytes stay bytes.
const blob = Extra.make({
  packageName: "test",
  id: "blob",
  prompt: Schema.Struct({ bytes: Schema.Uint8Array, at: Schema.DateTimeUtcFromMillis }),
  session: Schema.Struct({ bytes: Schema.Uint8Array }),
});

const ping = Event.make({
  packageName: "test",
  id: "ping",
  schema: Schema.Struct({ count: Schema.Number }),
});

const tokens = Metric.make({
  packageName: "test",
  id: "tokens",
  output: Schema.Struct({ count: Schema.Number }),
  failure: Schema.Struct({ message: Schema.String }),
});

const metrickit = MetricKit.make(tokens);

const config = Config.config({
  toolkit: Toolkit.empty,
  eventkit: EventKit.make(ping),
  metrickit,
  extrakit: ExtraKit.make(note, blob),
});

const part = Trajectory.parts(config);

const session = part.mainSession({ uuid: sessionId, "test/note": { text: "hello" } });

const subSession = part.subSession("child", { fork: sessionId });

const prompt = part.prompt(Prompt.make("hello"), {
  timestamp: at,
  "test/note": { text: "hi" },
});

const response = part.response(
  Response.anyToolCallPart({ id: "call_1", name: "get_weather", params: { city: "SF" } }),
  { timestamp: at },
);

const event = part.event(Event.EventPart(ping.tag, ping.schema).make({ data: { count: 2 } }), {
  timestamp: at,
});

// A metric part is produced, not written: its result names the session above.
const produced = await Metric.produce(
  MetricKit.toProducers(metrickit, {
    "test/tokens": () =>
      Stream.make(Metric.makeOutput<typeof tokens>({ count: 3 }, { attach: [sessionId] })),
  }),
)(Trajectory.make(config)(Stream.empty)).pipe(Stream.runCollect, Effect.runPromise);

const metric = part.metric(Array.from(produced)[0]!, { timestamp: at });

/** One stored schema per part kind, each read with the kit of its payload. */
const stored = {
  prompt: PromptPart(config.extrakit),
  session: SessionPart(config.extrakit),
  response: ResponsePart(config.toolkit, config.extrakit),
  event: EventPart(config.eventkit),
  metric: MetricPart(metrickit),
};

/** Every stored kind as one codec, which is what a frame reader derives. */
const Part = Schema.Union([
  stored.prompt,
  stored.session,
  stored.response,
  stored.event,
  stored.metric,
]);

it("lays out the stored form of every part kind", async () => {
  await Effect.forEach(Object.values(stored), (schema) => checkBinaryLayout(schema), {
    discard: true,
  }).pipe(Effect.runPromise);
});

it("lays out one union of every stored part kind", async () => {
  await checkBinaryLayout(Part).pipe(Effect.runPromise);
});

it("reads back every stored part as the part it was written from", () => {
  const codec = SchemaBinary.toCodec(Part);

  for (const written of [session, subSession, prompt, response, event, metric]) {
    const bytes = Schema.encodeSync(codec)(written);

    expect(Schema.decodeSync(codec)(bytes)).toEqual(written);
  }
});

it("reads an extra as the schema its declaration states", () => {
  const written = part.prompt(Prompt.make("hello"), {
    timestamp: at,
    "test/blob": { bytes: new Uint8Array([1, 2]), at },
  });

  const codec = SchemaBinary.toCodec(stored.prompt);
  const read: typeof written = Schema.decodeSync(codec)(Schema.encodeSync(codec)(written));

  expect(read.extra["test/blob"]?.bytes).toBeInstanceOf(Uint8Array);
  expect(DateTime.isDateTime(read.extra["test/blob"]?.at)).toBe(true);
  expect(read).toEqual(written);
});

it("states each part in the spellings a chunk holds", () => {
  const encoded = {
    Prompt: Schema.encodeSync(stored.prompt)(prompt),
    Session: Schema.encodeSync(stored.session)(session),
    Response: Schema.encodeSync(stored.response)(response),
    Event: Schema.encodeSync(stored.event)(event),
    Metric: Schema.encodeSync(stored.metric)(metric),
  };

  // The tag is what a reader tells one kind from another by, so each states it.
  for (const [tag, one] of Object.entries(encoded)) {
    expect(one._tag).toBe(tag);
  }

  // A uuid is its 16 bytes, a timestamp its epoch, and an attach entry a uuid.
  expect(encoded.Session.uuid).toEqual(uuid.parse(sessionId));
  expect(encoded.Prompt.timestamp).toBe(DateTime.toEpochMillis(at));
  expect(encoded.Metric.attach).toEqual([uuid.parse(sessionId)]);

  // The main session's id is the constant `"main"`, so it is not stored.
  expect(encoded.Session.type._tag).toBe("main");
  expect(encoded.Session.type).not.toHaveProperty("id");

  // The meta states the metric's tag and attach list, and the body the result.
  expect(encoded.Metric.metricTag).toBe("test/tokens");
  expect(encoded.Metric.data).toHaveProperty("_tag", "Output");
  expect(encoded.Metric.data).toHaveProperty("output", { count: 3 });
  expect(encoded.Metric.data).not.toHaveProperty("attach");
});
