import { fileURLToPath } from "node:url";

import { Exchange, Prompt, Response, Trajectory } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { DateTime, Effect, FileSystem, Stream } from "effect";

export const config = Config.config();

const part = Trajectory.parts(config);

type Produced = ReadonlyArray<Trajectory.Part<typeof config>>;

type Message = ReadonlyArray<
  Trajectory.PromptPartOf<typeof config> | Trajectory.ResponsePartOf<typeof config>
>;

export const Fixtures = fileURLToPath(new URL("fixtures/trajs", import.meta.url));

export const generation = {
  trajectories: 420,
  days: 14,
  seed: 20_260_101,
  prompts: { low: 1, high: 4 },
  subSessions: 0.25,
  tools: { grep: 0.5, read_file: 0.25, bash: 0.15, edit: 0.1 },
  models: { "gpt-5": 0.6, "claude-sonnet-4-6": 0.4 },
  tokens: {
    inputTokens: { low: 20, high: 140 },
    outputTokens: { low: 10, high: 50 },
  },
};

const questions = {
  "where is parseConfig defined": 1,
  "read the file it is defined in": 1,
  "run the tests": 1,
  "add a case for the parser": 1,
};

export const meanOf = (range: { readonly low: number; readonly high: number }): number =>
  (range.low + range.high) / 2;

const random = (seed: number) => {
  let state = seed;

  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const between = (draw: () => number, low: number, high: number): number =>
  low + Math.floor(draw() * (high - low + 1));

const pick = (draw: () => number, weights: Readonly<Record<string, number>>): string => {
  let point = draw();

  for (const [key, weight] of Object.entries(weights)) {
    point -= weight;

    if (point <= 0) return key;
  }

  return Object.keys(weights).at(-1)!;
};

const sessionIdOf = (index: number): string =>
  `01890a5d-ac96-774b-bcce-b302099a${index.toString(16).padStart(4, "0")}`;

const produced = (index: number): DateTime.Utc =>
  DateTime.fromDateUnsafe(new Date(Date.UTC(2026, 0, 1 + (index % generation.days), 9)));

const prompt = (sessionId: string | undefined, text: string, timestamp: DateTime.Utc) =>
  part.prompt(Prompt.make(text), { sessionId, timestamp });

const responses = (
  sessionId: string | undefined,
  id: string,
  timestamp: DateTime.Utc,
  draw: () => number,
): Message => [
  part.response(
    Response.makePart("response-metadata", { modelId: pick(draw, generation.models) }),
    {
      sessionId,
      timestamp,
    },
  ),
  part.response(
    Response.anyToolCallPart({
      id,
      name: pick(draw, generation.tools),
      params: {},
    }),
    { sessionId, timestamp },
  ),
  part.response(
    Response.makePart("finish", {
      reason: "tool-calls",
      usage: new Response.Usage({
        inputTokens: {
          total: between(
            draw,
            generation.tokens.inputTokens.low,
            generation.tokens.inputTokens.high,
          ),
        },
        outputTokens: {
          total: between(
            draw,
            generation.tokens.outputTokens.low,
            generation.tokens.outputTokens.high,
          ),
        },
      }),
    }),
    { sessionId, timestamp },
  ),
];

const conversation = (
  sessionId: string | undefined,
  id: string,
  prompts: number,
  timestamp: DateTime.Utc,
  draw: () => number,
): Message =>
  Array.from({ length: prompts }, (_, promptIndex) => [
    prompt(sessionId, pick(draw, questions), timestamp),
    ...responses(sessionId, `${id}_${promptIndex}`, timestamp, draw),
  ]).flat();

const partsOf = (index: number): Produced => {
  const draw = random(generation.seed + index);
  const timestamp = produced(index);
  const sub = sessionIdOf(index * 2 + 1);
  const prompts = (): number => between(draw, generation.prompts.low, generation.prompts.high);

  const answered = conversation(undefined, `${index}/root`, prompts(), timestamp, draw);

  return [
    part.mainSession(),
    ...answered,
    ...(draw() < generation.subSessions
      ? [
          part.subSession(sub, { fork: answered.at(-1)!.uuid }),
          ...conversation(sub, `${index}/sub`, prompts(), timestamp, draw),
        ]
      : []),
  ];
};

const trajectory = (parts: Produced) => Trajectory.make(config)(Stream.fromArray(parts));

export const writeFixtures = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exchange = yield* Exchange.Exchange;

    yield* fs.remove(Fixtures, { recursive: true, force: true });
    yield* fs.makeDirectory(Fixtures, { recursive: true });

    let written = 0;

    for (let index = 0; index < generation.trajectories; index++) {
      const parts = partsOf(index);

      written += parts.length;
      yield* exchange.save(trajectory(parts))(`${Fixtures}/trajectory-${index}.trajs`);
    }

    return written;
  });
