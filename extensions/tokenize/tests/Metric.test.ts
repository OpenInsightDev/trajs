/**
 * What the tokenize metric reports of a trajectory, end to end.
 *
 * The trajectory below is built with the core's own constructors and read by the
 * metric's own kit and producer, with the tokenizer this package ships, so what is
 * exercised is the way a trajectory is counted rather than one function of the
 * package: the parts in, the reports a kit produces of them out.
 *
 * A count is estimated from the text of a part, so the tokens a case asserts are
 * related to one another rather than pinned to numbers a tokenizer's encoding
 * would change — apart from the rule of a payload that is not text, which is a
 * number the package publishes.
 */
import { Event, Extra, Metric, Prompt, Response, Toolkit, Trajectory } from "@trajs/core";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { makeProducer, metrickit, Tokenizer, tokenEstimate } from "../src/index.ts";
import type { Estimate } from "../src/index.ts";

/** The session the first half of the trajectory runs in, and the one it forks to. */
const asking = "01890a5d-ac96-774b-bcce-b302099a8057";

const answering = "01890a5d-ac96-774b-bcce-b302099a8058";

const extrakit = Extra.makeKit();

/** A prompt part, as a trajectory holds one. */
const promptPart = (prompt: Prompt.Prompt, sessionId: string) =>
  Trajectory.promptPart(extrakit)({ prompt, sessionId });

/** A response part that was produced whole, as a trajectory holds one. */
const responsePart = Trajectory.responsePart({
  toolkit: Toolkit.empty,
  extrakit,
  stream: false,
});

/**
 * A PNG of the given size: the header is all a media rule reads, so the bytes need
 * not be a decodable image for the size to be counted.
 */
const png = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(24);

  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);

  return bytes;
};

// One turn of a session that called a tool: what the model was given, what it
// answered, the call it made, the result of that call, and why it stopped.
const declared = Trajectory.sessionPart(extrakit)({ id: asking });

const question = promptPart(Prompt.make("what is the weather in SF"), asking);

const answer = responsePart({
  response: Response.makePart("text", { text: "let me look that up" }),
  sessionId: asking,
});

const call = responsePart({
  response: Response.anyToolCallPart({
    id: "call_1",
    name: "get_weather",
    params: { city: "SF" },
    providerExecuted: false,
  }),
  sessionId: asking,
});

const result = responsePart({
  response: Response.anyToolResultPart({
    id: "call_1",
    name: "get_weather",
    result: { temp: 22 },
    isFailure: false,
    providerExecuted: false,
  }),
  sessionId: asking,
});

const stopped = responsePart({
  response: Response.makePart("finish", {
    reason: "stop",
    usage: new Response.Usage({ inputTokens: { total: 12 }, outputTokens: { total: 3 } }),
    response: undefined,
  }),
  sessionId: asking,
});

// A session that ran on a tool result alone, and was given a payload that is not
// text: the kinds of count the other session does not hold.
const forked = Trajectory.sessionPart(extrakit)({ id: answering });

const carried = promptPart(
  Prompt.fromMessages([
    Prompt.makeMessage("tool", {
      content: [
        Prompt.makePart("tool-result", {
          id: "call_1",
          name: "get_weather",
          isFailure: false,
          result: { temp: 22 },
          providerExecuted: false,
        }),
      ],
    }),
  ]),
  answering,
);

const image = responsePart({
  response: Response.makePart("file", { mediaType: "image/png", data: png(512, 512) }),
  sessionId: answering,
});

/** The trajectory's parts, in the one order a trajectory carries them in. */
const parts = [declared, question, answer, call, result, stopped, forked, carried, image];

/**
 * What the metric is run over: the parts above, as the trajectory they make.
 *
 * Its response parts are whole — `Trajectory.NonStreamConfig` — because that is the
 * trajectory a producer is given: the increments a streamed response arrived in are
 * folded into the parts they complete before a kit counts one.
 */
const trajectory = Object.assign(Stream.fromIterable(parts), {
  stream: false as const,
  toolkit: Toolkit.empty,
  eventkit: Event.makeKit(),
  metrickit: Metric.makeKit(),
  extrakit,
});

/**
 * Runs the metric over the trajectory, as a kit does: the producer the package builds
 * with a tokenizer, provided to the kit that produces what it derives.
 *
 * The media of the trajectory is priced with `"openai"` so that the count of the
 * image is a number the package publishes rather than one a family's rules moved.
 */
const report = async (): Promise<Map<string, Estimate>> => {
  const program = Effect.gen(function* () {
    const producer = yield* makeProducer({ media: "openai" }).pipe(
      Effect.provide(Tokenizer.layerOpenAi({ model: "gpt-4o" })),
    );

    const runnable = Metric.toProducers(metrickit, { [tokenEstimate.tag]: producer });
    const estimates = Metric.produce(runnable)(trajectory);
    const reported = Array.from(yield* estimates.pipe(Stream.runCollect));
    const byPart = new Map<string, Estimate>();

    for (const { _tag, data } of reported) {
      expect(_tag).toBe("@trajs/extension-tokenize/Estimate");
      expect(data._tag).toBe("ProducerOutput");

      if (data._tag === "ProducerOutput") byPart.set(data.attach[0], data.output);
    }

    return byPart;
  });

  return program.pipe(Effect.runPromise);
};

/** What was reported of one part, which fails a case where nothing was. */
const of = (byPart: Map<string, Estimate>, part: { uuid: string }): Estimate => {
  const reported = byPart.get(part.uuid);

  expect(reported).toBeDefined();

  if (reported === undefined) throw new Error("the part was not counted");

  return reported;
};

describe("the metric over a trajectory", () => {
  it("reports a count for the parts a count is taken from, and no other", async () => {
    const byPart = await report();

    expect(byPart.size).toBe(6);
    expect(of(byPart, question).count._tag).toBe("prompt");
    expect(of(byPart, answer).count._tag).toBe("text");
    expect(of(byPart, call).count._tag).toBe("tool-call");
    expect(of(byPart, result).count._tag).toBe("tool-result");
    expect(of(byPart, carried).count._tag).toBe("prompt");
    expect(of(byPart, image).count._tag).toBe("file");

    // A session declaration and a finish part carry nothing a tokenizer answers for.
    expect(byPart.get(declared.uuid)).toBeUndefined();
    expect(byPart.get(forked.uuid)).toBeUndefined();
    expect(byPart.get(stopped.uuid)).toBeUndefined();
  });

  it("states the kinds of a prompt beside its total", async () => {
    const byPart = await report();
    const asked = of(byPart, question).count;

    expect(asked._tag).toBe("prompt");

    if (asked._tag !== "prompt") return;

    expect(asked.text).toBeGreaterThan(0);
    expect(asked.reasoning).toBe(0);
    expect(asked.toolCall).toBe(0);
    expect(asked.toolResult).toBe(0);
    expect(asked.media).toBe(0);
    expect(asked.text + asked.reasoning + asked.toolCall + asked.toolResult + asked.media).toBe(
      asked.tokens,
    );
  });

  it("states a tool result of a prompt as its own kind", async () => {
    const byPart = await report();
    const carriedOver = of(byPart, carried).count;

    expect(carriedOver._tag).toBe("prompt");

    if (carriedOver._tag !== "prompt") return;

    // The prompt holds the result of a tool and nothing else.
    expect(carriedOver.toolResult).toBeGreaterThan(0);
    expect(carriedOver.text).toBe(0);
    expect(carriedOver.tokens).toBe(carriedOver.toolResult);
  });

  it("states a response part as its own kind, and no media a tokenizer counted", async () => {
    const byPart = await report();
    const answered = of(byPart, answer).count;

    expect(answered._tag).toBe("text");

    if (answered._tag !== "text") return;

    expect(answered.tokens).toBeGreaterThan(0);
    expect(answered.mediaTokens).toBe(0);
    expect(of(byPart, call).count.tokens).toBeGreaterThan(0);
  });

  it("pairs a tool result with the call it answers", async () => {
    const byPart = await report();
    const called = of(byPart, call).count;
    const returned = of(byPart, result).count;

    expect(returned._tag).toBe("tool-result");

    if (returned._tag !== "tool-result") return;

    expect(returned.tokens).toBeGreaterThan(0);
    expect(returned.toolCallTokens).toBe(called.tokens + returned.tokens);
  });

  it("prices a payload that is not text with the rule it was given", async () => {
    const byPart = await report();
    const given = of(byPart, image).count;

    expect(given._tag).toBe("file");

    if (given._tag !== "file") return;

    // A 512px image at the tile-based rule of the family: 85 tokens plus one tile.
    expect(given.tokens).toBe(255);
    expect(given.mediaTokens).toBe(given.tokens);
  });

  it("accumulates the total of each session on its own", async () => {
    const byPart = await report();
    const running = new Map<string, number>();

    for (const part of [question, answer, call, result, carried, image]) {
      const total = (running.get(part.sessionId) ?? 0) + of(byPart, part).count.tokens;

      running.set(part.sessionId, total);
      expect(of(byPart, part).total).toBe(total);
    }

    // A trajectory holds several sessions, and each is counted from its own
    // beginning: the first part counted in the second states only itself.
    expect(of(byPart, carried).total).toBe(of(byPart, carried).count.tokens);
    expect(of(byPart, image).total).toBe(
      of(byPart, carried).count.tokens + of(byPart, image).count.tokens,
    );
  });
});
