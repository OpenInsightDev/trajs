/**
 * The fixture set the example is of: what a run is drawn from, how one is built,
 * and where the set is written.
 *
 * A fixture is a trajectory an exchange keeps as one file, so the set is what a
 * program's own trajectories look like on disk — `cases/olap/fixtures/trajs`,
 * written again on every run and never committed. What it is drawn from is a
 * distribution rather than any one program's run: an agent that calls one of four
 * tools, a model that answers, and what a turn used to answer — each with the share
 * or the range the analysis at the end has to recover.
 */

import {
  EventKit,
  Exchange,
  ExtraKit,
  MetricKit,
  Prompt,
  Response,
  Toolkit,
  Trajectory,
} from "@trajs/core";
import { DateTime, Effect, FileSystem, Stream } from "effect";

const toolkit = Toolkit.empty;
const extrakit = ExtraKit.empty;

/** The kits the fixtures are built and read with: no events, no metrics, and whole response parts. */
export const config = Trajectory.config({
  stream: false,
  toolkit,
  extrakit,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
});

/** The builders of a fixture's parts, under the config the fixture is read with. */
const part = Trajectory.parts(config);

/** The parts of one fixture, as the builders below produce them and the exchange keeps them. */
type Produced = ReadonlyArray<Trajectory.Part<typeof config>>;

/** Where the set is kept: the `fixtures/` of this case, which the run generates and no commit holds. */
export const Fixtures = "cases/olap/fixtures/trajs";

/**
 * What the fixtures are drawn from: the weights the analysis has to recover.
 *
 * `turns` is how many turns a session produces and `tokens` what a turn uses, each
 * drawn from a range; `tools` and `models` are the shares each is drawn with, and
 * `subAgents` how often a run starts a sub-agent session of its own. The days the
 * runs were produced on are dealt out evenly rather than drawn, so that every day
 * holds as many runs and a daily aggregate answers that share.
 */
export const generation = {
  trajectories: 420,
  days: 14,
  seed: 20_260_101,
  turns: { low: 1, high: 4 },
  subAgents: 0.25,
  tools: { grep: 0.5, read_file: 0.25, bash: 0.15, edit: 0.1 },
  models: { "gpt-5": 0.6, "claude-sonnet-4-6": 0.4 },
  tokens: { input: { low: 20, high: 140 }, output: { low: 10, high: 50 } },
};

/** What the users asked, each as often as the weight states: the text is a fixture, its share is not measured. */
const questions = {
  "where is parseConfig defined": 1,
  "read the file it is defined in": 1,
  "run the tests": 1,
  "add a case for the parser": 1,
};

/** The mean of a whole number drawn from `low` to `high`, which is the average the analysis should answer. */
export const meanOf = (range: { readonly low: number; readonly high: number }): number =>
  (range.low + range.high) / 2;

/** A source of numbers in `[0, 1)`, drawn from `seed`: mulberry32, so a run's fixtures are the ones rerunning it makes. */
const random = (seed: number) => {
  let state = seed;

  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
};

/** A whole number from `low` to `high`, both ends included, drawn from `draw`. */
const between = (draw: () => number, low: number, high: number): number =>
  low + Math.floor(draw() * (high - low + 1));

/** The key of `weights` drawn from `draw`, as the share that key states. */
const pick = (draw: () => number, weights: Readonly<Record<string, number>>): string => {
  let point = draw();

  for (const [key, weight] of Object.entries(weights)) {
    point -= weight;

    if (point <= 0) return key;
  }

  // SAFETY: the weights of a distribution sum to one, so the draw lands on a key; the last one
  // is what a draw past their sum — which a weight of zero can make — is read as rather than failing.
  return Object.keys(weights).at(-1)!;
};

/** The id of the `index`th session, in the shape a uuid has: what a query groups by, not a value it measures. */
const sessionId = (index: number): string =>
  `01890a5d-ac96-774b-bcce-b302099a${index.toString(16).padStart(4, "0")}`;

/** When the `index`th run was produced: the day it is dealt to, so every day holds as many runs. */
const produced = (index: number): DateTime.Utc =>
  DateTime.fromDateUnsafe(new Date(Date.UTC(2026, 0, 1 + (index % generation.days), 9)));

/** The prompt a model was given, as a part of the trajectory it was given in. */
const prompt = (sessionId: string, text: string, timestamp: DateTime.Utc) =>
  part.prompt(Prompt.make(text), { sessionId, timestamp });

/** The parts one turn produced: the model that answered, the tool it called, and what it used to answer. */
const turn = (
  sessionId: string,
  id: string,
  timestamp: DateTime.Utc,
  draw: () => number,
): Produced => [
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
      providerExecuted: false,
    }),
    { sessionId, timestamp },
  ),
  part.response(
    Response.makePart("finish", {
      reason: "tool-calls",
      usage: new Response.Usage({
        inputTokens: {
          total: between(draw, generation.tokens.input.low, generation.tokens.input.high),
        },
        outputTokens: {
          total: between(draw, generation.tokens.output.low, generation.tokens.output.high),
        },
      }),
    }),
    { sessionId, timestamp },
  ),
];

/** The parts a session produced: `turns` turns, each the prompt asked and the response that answered it. */
const conversation = (
  sessionId: string,
  id: string,
  turns: number,
  timestamp: DateTime.Utc,
  draw: () => number,
): Produced =>
  Array.from({ length: turns }, (_, turnIndex) => [
    prompt(sessionId, pick(draw, questions), timestamp),
    ...turn(sessionId, `${id}_${turnIndex}`, timestamp, draw),
  ]).flat();

/**
 * The parts of the `index`th run: a session of its own turns, and — where the draw
 * starts one — the sub-agent session it produced inside the same trajectory.
 */
const partsOf = (index: number): Produced => {
  const draw = random(generation.seed + index);
  const timestamp = produced(index);
  const root = sessionId(index * 2);
  const sub = sessionId(index * 2 + 1);
  const turns = (): number => between(draw, generation.turns.low, generation.turns.high);

  return [
    part.session(root),
    ...conversation(root, `${index}/root`, turns(), timestamp, draw),
    ...(draw() < generation.subAgents
      ? [part.session(sub), ...conversation(sub, `${index}/sub`, turns(), timestamp, draw)]
      : []),
  ];
};

/** The trajectory those parts make, carrying the kits they are read and written with. */
const trajectory = (parts: Produced) => Trajectory.make(config)(Stream.fromArray(parts));

/**
 * Writes a trajectory per run into {@link Fixtures}, saying how many rows the set is.
 *
 * What is there before the run is removed, so what a reader of the directory finds
 * is the set the weights above draw rather than a set a run before it drew.
 */
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
