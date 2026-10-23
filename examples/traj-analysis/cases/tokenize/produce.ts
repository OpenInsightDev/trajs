/**
 * The trajectory the case is of: one session of an agent that answers a question about a
 * codebase, produced with the token count of every part of it.
 *
 * The counts are not written by hand. The producer the tokenize extension builds is run over
 * the parts as they are produced — `Produce.fromSessions` runs the producers of the metric
 * kit beside the stream that produces them — so what the fixture holds is what the package
 * derives of it. The case then reads the file rather than the producer, which is what
 * counting a trajectory is for: a count outlives the tokenizer that took it.
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EventKit,
  Exchange,
  ExtraKit,
  MetricKit,
  Produce,
  Prompt,
  Response,
  Toolkit,
  Trajectory,
} from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { makeProducer, metrickit, tokenEstimate, Tokenizer } from "@trajs/extension-tokenize";
import { Effect, FileSystem, Stream } from "effect";

const toolkit = Toolkit.empty;
const extrakit = ExtraKit.empty;
const eventkit = EventKit.empty;

/**
 * Where the fixture is kept: the `fixtures/` of this case, which a run generates and no commit
 * holds.
 */
export const Fixture = fileURLToPath(new URL("fixtures/session.trajs", import.meta.url));

/** The one call the model made, which the result it was given answers by the same id. */
const call = "call_01";

/** What the model was told to do, which every prompt of the session begins with. */
const system = Prompt.systemMessage({
  content: "You are a coding agent. Read the repository before you answer.",
});

/**
 * A PNG of the given size: only the header of an image is read, so the bytes need not be a
 * decodable image for the size it is priced at to be the size stated.
 */
const png = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(24);

  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);

  return bytes;
};

/** What the user gave the model: the question, and the screenshot it was asked about. */
const asked = Prompt.userMessage({
  content: [
    Prompt.makePart("text", {
      text: "The settings page times out after thirty seconds. Where is the timeout read from?",
    }),
    Prompt.makePart("file", { mediaType: "image/png", data: png(512, 512) }),
  ],
});

/** What the model thought before it searched. */
const thought =
  "The timeout is read where the configuration is parsed, so start from the symbol and read the lines around it.";

const pattern = { pattern: "parseConfig" };

const matches = { matches: ["src/config.ts:12"] };

/** What the model answered once it had read the result. */
const answered =
  "`parseConfig` reads it from `TIMEOUT` at src/config.ts:12, defaulting to thirty seconds.";

const askedPrompt = Prompt.fromMessages([system, asked]);

/**
 * The context of the second turn: the first turn as the provider replays it — the assistant
 * message as the model said it, reasoning included, and the result of the call it made — so
 * that what the model is given the second time is what it was given the first beside what
 * came of it.
 */
const replayed = Prompt.fromMessages([
  ...askedPrompt.content,
  Prompt.assistantMessage({
    content: [
      Prompt.makePart("reasoning", { text: thought }),
      Prompt.makePart("tool-call", {
        id: call,
        name: "grep",
        params: pattern,
        providerExecuted: false,
      }),
    ],
  }),
  Prompt.makeMessage("tool", {
    content: [
      Prompt.makePart("tool-result", {
        id: call,
        name: "grep",
        isFailure: false,
        result: matches,
        providerExecuted: false,
      }),
    ],
  }),
]);

/**
 * What the fixture is built and read with: whole response parts, and the metric kit the
 * counts of its parts are of.
 */
export const config = Config.config({
  stream: false,
  toolkit,
  eventkit,
  metrickit,
  extrakit,
});

/** The builders of the parts the fixture holds: the parts state the config above rather than
 * naming its kits again. */
const part = Trajectory.parts(config);

/** The parts of the session, in the order it produced them. */
const parts = [
  part.prompt(askedPrompt),
  part.response(Response.makePart("reasoning", { text: thought })),
  part.response(
    Response.anyToolCallPart({ id: call, name: "grep", params: pattern, providerExecuted: false }),
  ),
  part.response(
    Response.anyToolResultPart({
      id: call,
      name: "grep",
      result: matches,
      isFailure: false,
      providerExecuted: false,
    }),
  ),
  part.prompt(replayed),
  part.response(Response.makePart("text", { text: answered })),
  // What the provider reported the request cost, which is the exact figure a count is only an
  // estimate of — and a part no count is taken from, since a tokenizer answers for no usage.
  part.response(
    Response.makePart("finish", {
      reason: "stop",
      usage: new Response.Usage({
        inputTokens: { total: 412 },
        outputTokens: { total: 38 },
      }),
    }),
  ),
];

/**
 * Produces the session as the fixture, with the counts the kit derives of its parts.
 *
 * The directory is made rather than emptied: there is one fixture, and what a run writes is
 * what a reading of it finds.
 */
export const writeFixture = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exchange = yield* Exchange.Exchange;

    // The tokenizer is the producer's own dependency, so it is provided around the producer
    // rather than around the kit that runs it, and a part it fails on is produced as the
    // metric's own failure rather than failing the run. The image is priced with the
    // `"openai"` rule, since a payload that is not text is the one thing a tokenizer does not
    // count.
    const counted = yield* makeProducer({ media: "openai" }).pipe(
      Effect.map((producer) => MetricKit.toProducers(metrickit, { [tokenEstimate.tag]: producer })),
      Effect.provide(Tokenizer.layerOpenAi({ model: "gpt-4o" })),
    );

    // The fixture is produced with the config it is read with, and with the metric kit
    // provided with the producer its counts are taken by.
    const fixture = Produce.fromSessions({ ...config, metrickit: counted })({
      main: { messages: Stream.fromArray(parts) },
    });

    yield* fs.makeDirectory(dirname(Fixture), { recursive: true });

    yield* exchange.save(fixture)(Fixture);
  });
