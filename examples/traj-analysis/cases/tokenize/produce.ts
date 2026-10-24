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

export const Fixture = fileURLToPath(new URL("fixtures/session.trajs", import.meta.url));

const call = "call_01";

const system = Prompt.systemMessage({
  content: "You are a coding agent. Read the repository before you answer.",
});

const png = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(24);

  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);

  return bytes;
};

const asked = Prompt.userMessage({
  content: [
    Prompt.makePart("text", {
      text: "The settings page times out after thirty seconds. Where is the timeout read from?",
    }),
    Prompt.makePart("file", { mediaType: "image/png", data: png(512, 512) }),
  ],
});

const thought =
  "The timeout is read where the configuration is parsed, so start from the symbol and read the lines around it.";

const pattern = { pattern: "parseConfig" };

const matches = { matches: ["src/config.ts:12"] };

const answered =
  "`parseConfig` reads it from `TIMEOUT` at src/config.ts:12, defaulting to thirty seconds.";

const askedPrompt = Prompt.fromMessages([system, asked]);

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

export const config = Config.config({
  stream: false,
  toolkit,
  eventkit,
  metrickit,
  extrakit,
});

const part = Trajectory.parts(config);

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

export const writeFixture = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exchange = yield* Exchange.Exchange;

    const counted = yield* makeProducer({ media: "openai" }).pipe(
      Effect.map((producer) => MetricKit.toProducers(metrickit, { [tokenEstimate.tag]: producer })),
      Effect.provide(Tokenizer.layerOpenAi({ model: "gpt-4o" })),
    );

    const fixture = Produce.fromSessions({ ...config, metrickit: counted })({
      main: { messages: Stream.fromArray(parts) },
    });

    yield* fs.makeDirectory(dirname(Fixture), { recursive: true });

    yield* exchange.save(fixture)(Fixture);
  });
