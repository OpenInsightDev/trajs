/**
 * Writes the trajectory the viewer opens when nothing has been opened yet:
 * `public/sample.trajs`.
 *
 * Producing a session of a real model takes a model, an API key and a network,
 * and the viewer is opened without any of them, so the one it opens by default is
 * written here: the parts are built with `@trajs/core`'s own constructors and the
 * exchange turns them into the bytes a `.trajs` file holds. What it holds is what
 * the viewer has to be able to show — two sessions declared as roots, one of them
 * forked mid-conversation, and the turns each of them ran — rather than anything
 * a model said.
 *
 * Run it from this directory with `vp run sample`.
 */

import { fileURLToPath } from "node:url";

import { NodeServices as PlatformNode } from "@effect/platform-node";
import { EventKit, ExtraKit, MetricKit, Prompt, Response, Toolkit, Trajectory } from "@trajs/core";
import { Exchange } from "@trajs/core/Exchange";
import { NodeServices } from "@trajs/platform-node";
import { layerFileSystem } from "@trajs/utils/Storage";
import { DateTime, Effect, Formatter, Layer, Stream } from "effect";

/** What a response part looks like to a toolkit of no tools: the most a trajectory holds. */
type Streamed = Response.AllPartsView<{}>;

type Answered = Response.PartView<{}>;

/** The ids the trajectory names its sessions by. */
const planning = "planning";

const followUp = "follow-up";

const clarify = "clarify";

const review = "review";

/** What the sample is built and written with: response parts of either kind, and no other kit. */
const config = Trajectory.config({
  stream: true,
  toolkit: Toolkit.empty,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
});

/** The builders of the parts below, under that config. */
const part = Trajectory.parts(config);

/**
 * The `uuid` a part is written with, counted from the parts written before it: a
 * part names a session by id and a fork names a part by `uuid`, so a trajectory
 * written twice writes the same bytes — which is what keeps this script from
 * leaving a trajectory that differs from the one in the repository every time it is
 * run.
 */
let counted = 0;

const nextUuid = (): string => `01890000-0000-7000-8000-${String(++counted).padStart(12, "0")}`;

/**
 * A prompt, as the trajectory holds it, written with a `uuid` of this script's own
 * rather than one the builder generates: a fork is named by the `uuid` of the part it
 * continues from.
 */
const promptPart = (prompt: Prompt.Prompt, sessionId: string) =>
  part.prompt(prompt, { sessionId, uuid: nextUuid() });

/** A session, as the trajectory declares it, written the same way. */
const sessionPart = (id: string, fork?: string) => part.session(id, { fork, uuid: nextUuid() });

/**
 * The moment a part is written at, one second after the part before it: a response
 * part is timestamped where it was produced, so a trajectory written twice is the
 * same bytes only if the moments it holds are written here as well.
 */
let clock = Date.parse("2025-05-04T09:12:00Z");

const nextMoment = (): DateTime.Utc => DateTime.makeUnsafe(new Date((clock += 1_000)));

/** One increment of a response that was streamed, as the trajectory holds it. */
const increment = (sessionId: string, response: Streamed) =>
  part.response(response, { sessionId, uuid: nextUuid(), timestamp: nextMoment() });

/** One part of a response that was produced whole, as the trajectory holds it. */
const produced = (sessionId: string, response: Answered) =>
  part.response(response, { sessionId, uuid: nextUuid(), timestamp: nextMoment() });

type ProducedIncrement = ReturnType<typeof increment>;

const reasoning = (
  sessionId: string,
  id: string,
  thought: string,
): ReadonlyArray<ProducedIncrement> => [
  increment(sessionId, Response.makePart("reasoning-start", { id })),
  increment(sessionId, Response.makePart("reasoning-delta", { id, delta: thought })),
  increment(sessionId, Response.makePart("reasoning-end", { id })),
];

/**
 * The text of an answer, written in the fragments a model writes it in: a few
 * characters at a time rather than a block at a time.
 */
const written = (
  sessionId: string,
  id: string,
  answer: string,
  size = 12,
): ReadonlyArray<ProducedIncrement> => {
  const fragments: Array<string> = [];

  for (let at = 0; at < answer.length; at += size) fragments.push(answer.slice(at, at + size));

  return [
    increment(sessionId, Response.makePart("text-start", { id })),
    ...fragments.map((delta) =>
      increment(sessionId, Response.makePart("text-delta", { id, delta })),
    ),
    increment(sessionId, Response.makePart("text-end", { id })),
  ];
};

const stopped = (inputTokens: number, outputTokens: number): Answered =>
  Response.makePart("finish", {
    reason: "stop",
    usage: new Response.Usage({
      inputTokens: { total: inputTokens },
      outputTokens: { total: outputTokens },
    }),
    response: undefined,
  });

// The session the viewer opens on: a question about how a trajectory holds its
// sessions, answered as it was streamed.
const opening = promptPart(
  Prompt.make(
    "A trajectory holds every session that ran in one stream of parts. How does a reader tell them apart?",
  ),
  planning,
);

const openingAnswer = [
  ...reasoning(
    planning,
    "reasoning_0a1",
    "The question is about what a part says of the session it belongs to, so the answer is the field that says it, and what a part that names no session carries instead.",
  ),
  ...written(
    planning,
    "text_0b2",
    [
      "Every part names its session, so nothing is read apart from the stream:",
      "",
      "- a `Session` part declares one, by `id`, and continues another where it produces a `fork`",
      "- a prompt or a response part refers to the declaration by `sessionId`",
      "- a metric part names no session at all, and is read with the parts around it",
      "",
      "So the sessions of a trajectory are read by filtering its parts into them, once:",
      "",
      "```ts",
      "const sessions = await Effect.runPromise(Trajectory.toSessions(trajectory))",
      "```",
      "",
      "What tells the filtering apart from a mere partition is the fork: a session that continues from one of the parts of another runs on that session's parts up to there rather than repeating them.",
    ].join("\n"),
  ),
  increment(planning, stopped(1_284, 266)),
];

// The session forked off the one above, at the part its first turn ended with: it
// continues there rather than repeating the turn, which is what a fork is.
const forked = sessionPart(followUp, openingAnswer[openingAnswer.length - 1].uuid);

const carriedOn = promptPart(
  Prompt.make("And what does a fork hold of the session it continues from?"),
  followUp,
);

const carriedOnAnswer = [
  produced(
    followUp,
    Response.makePart("text", {
      text: [
        "None of it. A fork holds the part it continues from, and the session that produced it, and nothing else:",
        "",
        "```ts",
        "forkedFrom.pipe(Option.map((fork) => fork.part))",
        "```",
        "",
        "What it runs on is that session's parts up to and including that part, read out of where the trajectory is kept rather than copied.",
      ].join("\n"),
    }),
  ),
  produced(followUp, stopped(402, 118)),
];

// A fork of the fork: what a session inherited is read through the session it
// continues from, so a conversation inherited twice over is read back that far.
const clarifying = sessionPart(clarify, carriedOnAnswer[carriedOnAnswer.length - 1].uuid);

const askedAgain = promptPart(Prompt.make("And a fork of a fork?"), clarify);

const askedAgainAnswer = [
  produced(
    clarify,
    Response.makePart("text", {
      text: [
        "The same again, one session at a time: this one continues from `follow-up`, so it runs on what `follow-up` had reached, which is what `follow-up` inherited from `planning` plus its own turn.",
        "",
        "- the parts are still produced once, on the session that produced them",
        "- a fork runs on that session's parts up to where it continues from, and on its own after that",
      ].join("\n"),
    }),
  ),
  produced(clarify, stopped(196, 58)),
];

// The session above carries on once more, after the fork: what it produces from
// here is its own, and the session it was forked by does not hold it.
const closing = promptPart(
  Prompt.make("So a fork is a session that starts part-way through another one."),
  planning,
);

const closingAnswer = [
  produced(
    planning,
    Response.makePart("text", {
      text: "That is what it is: a session whose first parts are another session's, up to the part it continues from, and whose own parts are the ones it produced after it.",
    }),
  ),
  produced(planning, stopped(1_712, 96)),
];

// A second root: a trajectory is not one conversation, and a viewer that shows one
// session at a time still has to show what else the trajectory holds.
const asking = sessionPart(review);

const question = promptPart(
  Prompt.make("Does the viewer need the toolkit a trajectory names?"),
  review,
);

// A call for a tool the trajectory's header names nothing about, which is what a
// toolkit the trajectory is not read with leaves: the call as it was produced.
const toolCall = Response.anyToolCallPart({
  id: "call_7c31",
  name: "read_header",
  params: { field: "toolkit" },
  providerExecuted: false,
});

const questionAnswer = [
  produced(
    review,
    Response.makePart("text", {
      text: "Not to read one: a trajectory carries its parts as they were produced, so any toolkit reads them.",
    }),
  ),
  produced(review, toolCall),
  produced(review, stopped(348, 74)),
];

const answered = promptPart(
  Prompt.fromMessages([
    Prompt.makeMessage("tool", {
      content: [
        Prompt.makePart("tool-result", {
          id: "call_7c31",
          name: "read_header",
          isFailure: false,
          result: {
            toolkit: {},
            eventkit: {},
            metrickit: {},
            extrakit: {},
          },
          providerExecuted: false,
        }),
      ],
    }),
  ]),
  review,
);

const answeredAnswer = [
  produced(
    review,
    Response.makePart("text", {
      text: "The header of this trajectory names no tools, no events, no metrics and no extra data, so there is nothing to know beyond the parts themselves.",
    }),
  ),
  produced(review, stopped(512, 61)),
];

/** The trajectory's parts in the one order the exchange carries them in. */
const parts = [
  sessionPart(planning),
  opening,
  ...openingAnswer,
  forked,
  carriedOn,
  ...carriedOnAnswer,
  clarifying,
  askedAgain,
  ...askedAgainAnswer,
  closing,
  ...closingAnswer,
  asking,
  question,
  ...questionAnswer,
  answered,
  ...answeredAnswer,
];

const trajectory = Trajectory.make(Stream.fromIterable(parts), config);

const program = Effect.gen(function* () {
  const exchange = yield* Exchange;

  const id = fileURLToPath(new URL("../public/sample.trajs", import.meta.url));

  // The trajectory is written where it is named rather than held in memory first:
  // the storage of files is the sink the exchange writes it through.
  yield* exchange.save(trajectory)(id);

  yield* Effect.log(`Wrote ${id}`);
});

// The file storage reads through the file system `@effect/platform-node` provides,
// under the codecs of `@trajs/platform-node`.
const exchangeOverFiles = Layer.provide(
  Layer.provide(Exchange.layer, Layer.merge(NodeServices.layer(), layerFileSystem)),
  PlatformNode.layer,
);

void program.pipe(Effect.provide(exchangeOverFiles), Effect.runPromise).catch((cause) => {
  console.error(Formatter.format(cause));
  process.exitCode = 1;
});
