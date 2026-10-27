/**
 * Writes the trajectory the viewer opens when nothing has been opened yet:
 * `public/sample.trajs`.
 *
 * Producing a session of a real model takes a model, an API key and a network,
 * and the viewer is opened without any of them, so the one it opens by default is
 * written here: the parts are built with `@trajs/core`'s own constructors and the
 * exchange turns them into the bytes a `.trajs` file holds. What it holds is what
 * the viewer has to be able to show — the main session of a trajectory, the sessions
 * forked mid-conversation from it, and one forked from where it was declared — rather
 * than anything a model said.
 *
 * Run it from this directory with `vp run sample`.
 */

import { fileURLToPath } from "node:url";

import { NodeServices as PlatformNode } from "@effect/platform-node";
import { EventKit, ExtraKit, MetricKit, Prompt, Response, Toolkit, Trajectory } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import * as Exchange from "@trajs/core/Exchange";
import { NodeServices } from "@trajs/platform-node";
import { layerFileSystem } from "@trajs/utils/Storage";
import { DateTime, Effect, Formatter, Layer, Stream } from "effect";

/** The ids the trajectory names its sessions by: the main session, and the ones forked. */
const planning = Trajectory.mainSessionId;

const followUp = "follow-up";

const clarify = "clarify";

const review = "review";

/** What a response part looks like to a toolkit of no tools. */
type Answered = Response.PartView<{}>;

/** What the sample is built and written with: no tools, and no other kit. */
const config = Config.config({
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

/** The declaration of the main session, written the same way. */
const mainSessionPart = () => part.mainSession({ uuid: nextUuid() });

/** A session of its own, as the trajectory declares it: continuing from the part given. */
const subSessionPart = (id: string, fork: string) =>
  part.subSession(id, { fork, uuid: nextUuid() });

/**
 * The moment a part is written at, one second after the part before it: a response
 * part is timestamped where it was produced, so a trajectory written twice is the
 * same bytes only if the moments it holds are written here as well.
 */
let clock = Date.parse("2025-05-04T09:12:00Z");

const nextMoment = (): DateTime.Utc => DateTime.makeUnsafe(new Date((clock += 1_000)));

/** One part of a response, as the trajectory holds it. */
const produced = (sessionId: string, response: Answered) =>
  part.response(response, { sessionId, uuid: nextUuid(), timestamp: nextMoment() });

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
// sessions, answered with the thinking behind the answer and the answer itself.
const opening = promptPart(
  Prompt.make(
    "A trajectory holds every session that ran in one stream of parts. How does a reader tell them apart?",
  ),
  planning,
);

const openingAnswer = [
  produced(
    planning,
    Response.makePart("reasoning", {
      text: "The question is about what a part says of the session it belongs to, so the answer is the field that says it, and what a part that names no session carries instead.",
    }),
  ),
  produced(
    planning,
    Response.makePart("text", {
      text: [
        "Every part names its session, so nothing is read apart from the stream:",
        "",
        "- a `Session` part declares one, by `id`, and continues another where it produces a `fork`",
        "- a prompt or a response part refers to the declaration by `sessionId`",
        "- a metric part names no session at all, and is read with the parts around it",
        "",
        "So the sessions of a trajectory are read by filtering its parts into them, once:",
        "",
        "```ts",
        "const main = await Effect.runPromise(Session.main(trajectory))",
        "const sessions = Session.all(main)",
        "```",
        "",
        "What tells the filtering apart from a mere partition is the fork: a session that continues from one of the parts of another runs on that session's parts up to there rather than repeating them.",
      ].join("\n"),
    }),
  ),
  produced(planning, stopped(1_284, 266)),
];

// The main session, which the parts of the viewer's first conversation belong to.
const main = mainSessionPart();

// The session forked off the one above, at the part its first turn ended with: it
// continues there rather than repeating the turn, which is what a fork is.
const forked = subSessionPart(followUp, openingAnswer[openingAnswer.length - 1].uuid);

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
const clarifying = subSessionPart(clarify, carriedOnAnswer[carriedOnAnswer.length - 1].uuid);

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

// A conversation of its own: a trajectory is not one session, and a viewer that shows
// one at a time still has to show what else the trajectory holds — so this one
// continues from where the main session was declared, which starts it at the
// beginning rather than part-way through.
const asking = subSessionPart(review, main.uuid);

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
  main,
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

const trajectory = Trajectory.make(config)(Stream.fromIterable(parts));

const program = Effect.gen(function* () {
  const exchange = yield* Exchange.Exchange;

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
