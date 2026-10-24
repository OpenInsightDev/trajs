import { Data, Effect, Option, Stream } from "effect";
import { Prompt } from "effect/ai";

import * as Config from "#/Config.ts";
import { collapse } from "#/internal/folding.ts";
import { closed, idle, opened, turnsOf, type Assembly, type Run } from "#/internal/view.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";

type Tools<Config extends Config.AnyConfig> = Config["toolkit"]["tools"];

export type PromptTurn<Config extends Config.AnyConfig> = Readonly<{
  prompt: Trajectory.PromptPart<Config["extrakit"]>;
  response: ReadonlyArray<Response.PartView<Tools<Config>>>;
}>;

const assemble = <Config extends Config.AnyConfig>(
  assembly: Assembly<PromptTurn<Config>>,
  part: Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
): readonly [Assembly<PromptTurn<Config>>, ReadonlyArray<PromptTurn<Config>>] => {
  switch (part._tag) {
    case "Prompt":
      // A prompt opens a turn and closes the one before it, whether or not that one
      // was answered, so the turns are emitted in the order they were produced in.
      return [opened<PromptTurn<Config>>({ prompt: part, response: [] }), turnsOf(assembly)];

    case "Response": {
      const open = assembly.turn;

      // A response is on the turn the prompt before it opened; one no prompt precedes is on no
      // turn, and is dropped. A part that states no session belongs to the main session, as one
      // stating `"main"` does.
      const session = part.sessionId ?? Trajectory.mainSessionId;

      if (
        Option.isNone(open) ||
        (open.value.prompt.sessionId ?? Trajectory.mainSessionId) !== session
      ) {
        return [assembly, []];
      }

      const [folding, folded] = collapse(assembly.folding, session, part.response);
      const response = [...open.value.response, ...folded];

      return [{ turn: Option.some({ prompt: open.value.prompt, response }), folding }, []];
    }

    default:
      return [assembly, []];
  }
};

export const promptTurns = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<PromptTurn<Config>, E, R> =>
  stream.pipe(
    Stream.mapAccum(closed<PromptTurn<Config>>, assemble<Config>, {
      // The turn the parts end in has no prompt after it to close it, so the parts ending is
      // what closes it.
      onHalt: turnsOf,
    }),
  );

export const prompt = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E, R> =>
  promptTurns(stream).pipe(
    Stream.runFold(
      () => Prompt.empty,
      (folded, turn) =>
        folded.pipe(
          Prompt.concat(Prompt.fromMessages(turn.prompt.messages)),
          Prompt.concat(Prompt.fromResponseParts(turn.response)),
        ),
    ),
  );

/**
 * One step of a session: a prompt, the responses produced together, or an event.
 *
 * **When to use**
 *
 * Use to read a session as the units its parts state rather than as the turns a model
 * answered, such as to display them, to score them, or to hand them to a format that
 * states a run as steps.
 *
 * **Details**
 *
 * A step holds one of the three kinds of part a session runs on, and its `_tag` states
 * which. A {@link PromptStep} holds one request a model was given, with the messages
 * and the moment of that request. A {@link ResponseStep} holds the parts a model
 * produced together, in the order it produced them. An {@link EventStep} holds one
 * happening of the run.
 *
 * Session declarations and metric parts are not steps, and a metric part does not end
 * a run of responses.
 *
 * A step states no ordinal of its own. The steps of a stream are in the order the
 * parts were produced in, so a reader numbers them by their position.
 *
 * @see {@link steps} for the reading that emits them.
 * @category models
 */
export type Step<Config extends Config.AnyConfig> =
  | PromptStep<Config>
  | ResponseStep<Config>
  | EventStep<Config>;

/**
 * A step that holds one request a model was given.
 *
 * @see {@link Step} for the steps a session is read as.
 * @category models
 */
export class PromptStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Prompt")<{
  readonly prompt: Trajectory.PromptPart<Config["extrakit"]>;
}> {}

/**
 * A step that holds the parts a model produced together.
 *
 * @see {@link Step} for the steps a session is read as.
 * @category models
 */
export class ResponseStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Response")<{
  readonly response: ReadonlyArray<Response.PartView<Tools<Config>>>;
}> {}

/**
 * A step that holds one happening of the run.
 *
 * @see {@link Step} for the steps a session is read as.
 * @category models
 */
export class EventStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Event")<{
  readonly event: Trajectory.EventPart<Config["eventkit"]>;
}> {}

/** The step a run states, where it produced any part. */
const stepsOf = <Config extends Config.AnyConfig>(
  run: Run<Tools<Config>>,
): ReadonlyArray<Step<Config>> =>
  run.response.length === 0 ? [] : [new ResponseStep<Config>({ response: run.response })];

const assembleStep = <Config extends Config.AnyConfig>(
  run: Run<Tools<Config>>,
  part: Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
): readonly [Run<Tools<Config>>, ReadonlyArray<Step<Config>>] => {
  switch (part._tag) {
    case "Prompt":
      // A prompt ends the run of responses before it, and opens a folding of its own.
      return [idle<Tools<Config>>(), [...stepsOf(run), new PromptStep<Config>({ prompt: part })]];

    case "Event":
      // An event ends the run of responses before it, but a chunk it interrupted stays open.
      return [
        { response: [], folding: run.folding },
        [...stepsOf(run), new EventStep<Config>({ event: part })],
      ];

    case "Response": {
      const [folding, folded] = collapse(
        run.folding,
        part.sessionId ?? Trajectory.mainSessionId,
        part.response,
      );

      return [{ response: [...run.response, ...folded], folding }, []];
    }

    default:
      return [run, []];
  }
};

/**
 * Reads the parts of a session as the steps they state.
 *
 * **When to use**
 *
 * Use when a session is to be read by what its parts are rather than by the turns a
 * model answered: each prompt it was given, the responses produced together, and each
 * event of the run.
 *
 * **Details**
 *
 * The parts are read once, in the order the session holds them. The increments of a
 * streamed response are folded into the parts they complete, and a response part with
 * no completed part of its own is read past.
 *
 * A run of response parts ends at the prompt or the event that follows it, and at the
 * end of the parts. The step of the run is emitted where the run ends, so a step is
 * emitted once the parts that state it are complete.
 *
 * What the stream reads is the parts of one session
 * ({@link Session.SessionStream}), so a trajectory of several sessions is read one
 * session at a time.
 *
 * @see {@link Step} for the steps it emits.
 * @see {@link promptTurns} for the turns a model answered rather than the parts.
 * @category combinators
 */
export const steps = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<Step<Config>, E, R> =>
  stream.pipe(
    Stream.mapAccum(idle<Tools<Config>>, assembleStep<Config>, {
      // The run the parts end in has no prompt or event after it to close it, so the parts
      // ending is what closes it.
      onHalt: stepsOf,
    }),
  );

export type ToolTurn<Config extends Config.AnyConfig> = Readonly<{
  call: Response.ToolCallPartsView<Tools<Config>>;
  result: Response.ToolResultPartsView<Tools<Config>>;
}>;

export const toolTurns = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<ToolTurn<Config>, E, R> =>
  stream.pipe(
    Stream.mapAccum(
      () => new Map<string, Response.ToolCallPartsView<Tools<Config>>>(),
      (calls, part) => {
        if (part._tag !== "Response") return [calls, []];

        const response = part.response;

        switch (response.type) {
          case "tool-call":
            calls.set(response.id, response);

            return [calls, []];
          case "tool-result": {
            if (response.preliminary) return [calls, []];

            const call = calls.get(response.id);

            if (call === undefined) return [calls, []];

            calls.delete(response.id);

            return [calls, [{ call, result: response }]];
          }

          default:
            return [calls, []];
        }
      },
    ),
  );
