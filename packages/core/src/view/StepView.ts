/**
 * Conversation steps of one session, and the prompt they reconstruct.
 *
 * {@link steps} groups one session's responses and {@link prompt} reconstructs its conversation.
 *
 * @stability stable
 */

import { Data, Match, Stream, type Effect } from "effect";
import { Prompt, type Tool } from "effect/ai";

import type * as Config from "#/Config.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import type * as Trajectory from "#/Trajectory.ts";

type Tools<Config extends Config.AnyConfig> = Config["toolkit"]["tools"];

/**
 * Reconstructs a prompt from a session's messages and finished responses.
 *
 * **When to use**
 *
 * Use to build conversation context for another model call.
 *
 * **Details**
 *
 * Prompt messages retain their order.
 * Response steps become messages through {@link Prompt.fromResponseParts}.
 * Events and metric results add no messages.
 *
 * **Gotchas**
 *
 * The entire conversation is retained until the input ends.
 * An infinite session never returns a prompt.
 *
 * @see {@link steps} for incremental step access.
 * @see {@link Session.stream} for including inherited context.
 * @stability stable
 * @category converting
 */
export const prompt = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E, R> =>
  steps(stream).pipe(
    Stream.runFold(
      () => Prompt.empty,
      (folded, step) =>
        Match.valueTags(step, {
          Prompt: ({ prompt }) => folded.pipe(Prompt.concat(Prompt.fromMessages(prompt.messages))),
          Response: ({ response }) =>
            folded.pipe(Prompt.concat(Prompt.fromResponseParts(response))),
          Event: () => folded,
        }),
    ),
  );

/**
 * A prompt, a completed response group, or an event from one session.
 *
 * **Details**
 *
 * Steps have no ordinal.
 * Session declarations and metric results do not become steps.
 *
 * @see {@link steps} for grouping and emission rules.
 * @stability stable
 * @category models
 */
export type Step<Config extends Config.AnyConfig> =
  | PromptStep<Config>
  | ResponseStep<Config>
  | EventStep<Config>;

/**
 * A prompt part retaining its messages, extras, and timing.
 *
 * @see {@link Step} for all step variants.
 * @stability stable
 * @category models
 */
export class PromptStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Prompt")<{
  readonly prompt: Trajectory.PromptPart<Config["extrakit"]>;
}> {}

/**
 * Finished response payloads grouped between prompts or events.
 *
 * **Gotchas**
 *
 * The group does not retain trajectory part uuids, timestamps, or extras.
 *
 * @see {@link steps} for group boundaries.
 * @stability stable
 * @category models
 */
export class ResponseStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Response")<{
  readonly response: ReadonlyArray<Response.PartView<Tools<Config>>>;
}> {}

/**
 * An event part retaining its payload, uuid, and timing.
 *
 * @see {@link Step} for all step variants.
 * @stability stable
 * @category models
 */
export class EventStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Event")<{
  readonly event: Trajectory.EventPart<Config["eventkit"]>;
}> {}

/** The finished responses of one run, since the last prompt or event. */
interface Run<Tools extends Record<string, Tool.Any>> {
  readonly response: ReadonlyArray<Response.PartView<Tools>>;
}

const idle = <Tools extends Record<string, Tool.Any>>(): Run<Tools> => ({ response: [] });

/** The step a run states, where it produced any part. */
const stepsOf = <Config extends Config.AnyConfig>(
  run: Run<Tools<Config>>,
): ReadonlyArray<Step<Config>> =>
  run.response.length === 0 ? [] : [new ResponseStep<Config>({ response: run.response })];

/** The responses a part leaves open, and the steps it closed. */
type Assembly<Config extends Config.AnyConfig> = readonly [
  Run<Tools<Config>>,
  ReadonlyArray<Step<Config>>,
];

const assembleStep = <Config extends Config.AnyConfig>(
  run: Run<Tools<Config>>,
  part: Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
): Assembly<Config> =>
  Match.value(part).pipe(
    // A prompt ends the run of responses before it.
    Match.tag("Prompt", (prompt): Assembly<Config> => [
      idle<Tools<Config>>(),
      [...stepsOf(run), new PromptStep<Config>({ prompt })],
    ]),
    // An event ends the run of responses before it.
    Match.tag("Event", (event): Assembly<Config> => [
      idle<Tools<Config>>(),
      [...stepsOf(run), new EventStep<Config>({ event })],
    ]),
    Match.tag("Response", (response): Assembly<Config> => [
      { response: [...run.response, response.response] },
      [],
    ]),
    // A result names a part of an earlier step, so it neither starts nor ends one.
    Match.tag("Metric", (): Assembly<Config> => [run, []]),
    Match.exhaustive,
  );

/**
 * Groups one session's parts into prompt, response, and event steps.
 *
 * **When to use**
 *
 * Use when displaying or converting a conversation by turn rather than by individual response parts.
 *
 * **Details**
 *
 * A prompt or event closes the current response group.
 * End of input also emits the remaining group.
 * Metric results do not close a group.
 *
 * **Gotchas**
 *
 * Input must contain only one session.
 * The current response group remains in memory until its boundary.
 *
 * @see {@link Step} for the output variants.
 * @see {@link prompt} for collecting the conversation into a prompt.
 * @stability stable
 * @category transforming
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
