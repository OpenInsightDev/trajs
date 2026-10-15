/**
 * Reads a trajectory as the conversation a model ran on.
 *
 * A recording is a stream of parts in one total order: the messages a model was
 * given, the parts it returned, session declarations and the parts a kit
 * contributes. That is not the conversation itself. This module derives the
 * conversation from it:
 * {@link promptTurns} groups the parts into turns — a prompt and the responses
 * produced for it — and {@link prompt} folds the turns back into the single
 * prompt the model was given.
 *
 * Parts name the session that recorded them, but a stream is read as the one order
 * it gives: the turns of a recording that interleaves several sessions arrive one
 * after another, so read one session at a time rather than a whole such recording.
 */

import { Cause, Effect, Exit, Option, Queue, Stream } from "effect";
import { Prompt, type Tool } from "effect/ai";

import { collapse, initial, type State } from "#/internal/folding.ts";
import type * as Response from "#/Response.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The turn being assembled, and the state of folding the increments of its
 * response into the parts they complete.
 */
type Assembly<Tools extends Record<string, Tool.Any>> = Readonly<{
  turn: Option.Option<PromptTurn<Tools>>;
  folding: State;
}>;

/**
 * Folds a trajectory back into the prompt its model was given.
 *
 * **When to use**
 *
 * Use when the conversation a recording ran on is to be continued, evaluated or
 * inspected as one prompt rather than turn by turn.
 *
 * **Details**
 *
 * The turns of the trajectory are concatenated in the order they were recorded,
 * each prompt part being followed by the messages its response parts fold into,
 * so the result holds the messages of the whole trajectory rather than of one
 * turn. Session parts are skipped and response parts that no prompt precedes are
 * dropped, exactly as in {@link promptTurns}.
 *
 * Parts name the session that recorded them, but their turns are still folded in
 * the order the stream gave them, so the prompt of a recording that interleaves
 * several sessions is the prompt of all of them: read one session at a time
 * rather than a whole such recording.
 *
 * The effect fails with the trajectory's failure — `E` on top of the
 * {@link TrajectoryError} a recorded trajectory fails with — and requires the
 * services `R` names.
 *
 * **Example** (Folding a recording back into the prompt a model was given)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Extensionkit, Response, Trajectory, View } from "@trajs/core"
 *
 * const kit = { tool: Toolkit.empty, ext: Extensionkit.empty }
 * const variant = { ext: false, stream: false } as const
 * const responsePart = Trajectory.ResponsePart(kit.tool, variant.stream)
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(
 *     Trajectory.promptPart(Prompt.make("What is 2 + 2?"), Trajectory.rootSession),
 *     responsePart.make({ response: Response.makePart("text", { text: "4" }), sessionId: Trajectory.rootSession })
 *   ),
 *   kit,
 *   variant
 * )
 *
 * const folded = await Effect.runPromise(View.prompt(trajectory))
 * folded.content.map((message) => message.role) // => ["user", "assistant"]
 * ```
 *
 * @see {@link promptTurns} — read the turns it is folded from.
 * @category combinators
 */
export const prompt = <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R>(
  trajectory: Trajectory.TrajectoryStream<K, V, E, R>,
): Effect.Effect<Prompt.Prompt, E | TrajectoryError, R> =>
  promptTurns(trajectory).pipe(
    Stream.runFold(
      () => Prompt.empty,
      (folded, { prompt, response }) =>
        Prompt.concat(folded, Prompt.concat(prompt, Prompt.fromResponseParts(response))),
    ),
  );

/**
 * A prompt together with the response parts recorded for it.
 *
 * **When to use**
 *
 * Use when a recorded turn is to be read as what a model was asked and what it
 * answered, such as to display or score the turn.
 *
 * **Details**
 *
 * `prompt` holds the messages the model was given, and `response` every response
 * part recorded for them, folded, in the order they were recorded.
 *
 * @see {@link promptTurns} for the turns a trajectory is grouped into.
 * @see {@link prompt} for folding them back into one prompt.
 * @category models
 */
export type PromptTurn<Tools extends Record<string, Tool.Any>> = Readonly<{
  /** The messages the model was given. */
  prompt: Prompt.Prompt;
  /** The response parts recorded for them, folded. */
  response: Response.PartView<Tools>[];
}>;

/**
 * Groups the parts of a trajectory into the turns they were recorded as.
 *
 * **When to use**
 *
 * Use when reading a recording turn by turn, such as to inspect what a model was
 * asked and what it answered, or to attribute a response to the prompt it
 * answered.
 *
 * **Details**
 *
 * A prompt part opens a turn and every response part that follows it until the
 * next prompt is recorded on it. Session parts are skipped, and so are response
 * parts that no prompt precedes, because they belong to no recorded prompt. A
 * turn is emitted once the next prompt is reached, so only the turn being
 * assembled is held, and the last one is emitted when the trajectory ends.
 *
 * A turn holds folded response parts whatever the trajectory recorded. The
 * increments a streamed response arrives in — the chunks of a text or reasoning
 * part, and the parameters streaming into a tool call — are folded into the part
 * they complete as they arrive, and the parts only such a response has are
 * dropped, so a recording of a streamed response reads as the conversation it is
 * rather than as the increments it arrived in. A recording whose responses are
 * folded already reads as it is.
 *
 * Parts name the session that recorded them, and the increments of a response are
 * folded in its own session's bucket, but a turn is opened by whichever prompt
 * arrives next: the turns of a recording that interleaves several sessions are
 * emitted one after another, so read one session at a time rather than a whole
 * such recording.
 *
 * The stream fails with the trajectory's failure — `E` on top of the
 * {@link TrajectoryError} a recorded trajectory fails with — and requires the
 * services `R` names.
 *
 * **Example** (Reading a recording turn by turn)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Extensionkit, Response, Trajectory, View } from "@trajs/core"
 *
 * const kit = { tool: Toolkit.empty, ext: Extensionkit.empty }
 * const variant = { ext: false, stream: false } as const
 * const responsePart = Trajectory.ResponsePart(kit.tool, variant.stream)
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(
 *     Trajectory.promptPart(Prompt.make("What is 2 + 2?"), Trajectory.rootSession),
 *     responsePart.make({ response: Response.makePart("text", { text: "4" }), sessionId: Trajectory.rootSession })
 *   ),
 *   kit,
 *   variant
 * )
 *
 * const turns = await Effect.runPromise(Stream.runCollect(View.promptTurns(trajectory)))
 * turns.length // => 1
 * ```
 *
 * @see {@link PromptTurn} — the turns that are emitted.
 * @see {@link prompt} — fold them back into one prompt.
 * @category combinators
 */
export const promptTurns = <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R>(
  trajectory: Trajectory.TrajectoryStream<K, V, E, R>,
): Stream.Stream<PromptTurn<K["tool"]["tools"]>, E | TrajectoryError, R> =>
  // A turn is only known to be over once the next prompt is reached, so the
  // trajectory is closed with a marker that releases the turn still open; a
  // trajectory that fails reaches no marker, because a turn of it is incomplete.
  Stream.concat(
    trajectory.pipe(Stream.map(Option.some)),
    Stream.make(Option.none<Trajectory.Part<K, V>>()),
  ).pipe(
    Stream.mapAccum(
      (): Assembly<K["tool"]["tools"]> => ({ turn: Option.none(), folding: initial() }),
      (assembling, part) => {
        if (Option.isNone(part)) {
          return [assembling, Option.toArray(assembling.turn)] as const;
        }

        const value = part.value;

        if (value._tag === "Prompt") {
          const opened: PromptTurn<K["tool"]["tools"]> = {
            prompt: Prompt.fromMessages(value.messages),
            response: [],
          };

          // A turn folds the increments recorded in it alone, so a chunk left
          // open by the turn before it does not run into this one.
          return [
            { turn: Option.some(opened), folding: initial() },
            Option.toArray(assembling.turn),
          ] as const;
        }

        if (value._tag !== "Response") {
          return [assembling, []] as const;
        }

        // The increments of a response belong to the session that recorded it, so
        // the increments of sessions recorded interleaved fold apart, exactly as
        // they do in `Trajectory.fold`.
        const [folding, folded] = collapse(assembling.folding, value.sessionId, value.response);

        if (Option.isSome(assembling.turn)) {
          // Appended in place: a turn holds every response recorded for it, and
          // copying the list on each part would make holding quadratic in it.
          for (const response of folded) assembling.turn.value.response.push(response);
        }

        return [{ turn: assembling.turn, folding }, []] as const;
      },
    ),
  );

/**
 * A recorded part together with the derived data attached to it.
 *
 * **When to use**
 *
 * Use when a part of a recording is to be read with what a kit derived of it —
 * what it costs, what it holds — such as to display or score the part by it.
 *
 * **Details**
 *
 * It is the part as it was recorded — the kind of part it is, the session that
 * recorded it, its uuid and what it carries — with the derived data attached to
 * it added to it, so a part of a view reads as the part it is. The data of a part
 * names it by uuid rather than by where it was recorded, so the stream of it may
 * carry data recorded before the part or after the parts that follow it. A part a
 * kit contributes with a tag of its own — a system event — is not attached to
 * another part but stands where it was recorded; what it contributes is its own
 * part rather than data of this one.
 *
 * @see {@link attached} for the view these parts are read as.
 * @category models
 */
export type AttachedPart<
  K extends Trajectory.AnyKit,
  V extends Trajectory.AnyVariant,
  E,
  R,
> = Trajectory.Part<K, V> &
  Readonly<{
    derived: Stream.Stream<Trajectory.DerivedPart<K["ext"]>, E | TrajectoryError, R>;
  }>;

/**
 * Reads a trajectory as its parts, each with the derived data attached to it.
 *
 * **When to use**
 *
 * Use when what a kit derived of a recording is to be read with the parts it was
 * derived from — what a part costs, what a turn holds — rather than on their own,
 * such as to display a recording by what each of its parts is worth.
 *
 * **Details**
 *
 * A part's data is recorded as a derived part that names the parts it is about by
 * their `uuid`, and each part of the trajectory is emitted as it is recorded,
 * carrying a stream of the data attached to it. A producer records what it
 * derives of a part beside it and waits for nothing, so the data of a part is not
 * the data recorded next to it: it may be recorded after the parts that follow
 * it, or before the part itself, and a part's data is read as it arrives rather
 * than as the run of data that follows the part.
 *
 * The parts of the view are the trajectory's own: a derived part is read with the
 * parts it names rather than as a part of its own, and one that names no part of
 * the trajectory belongs to none of them and is not read at all, as a response
 * part that no prompt precedes belongs to no turn. A part whose tag is its own —
 * a system event — is emitted as it was recorded, whether or not anything is
 * about it. The trajectory is read while the view is read rather than on the
 * demand of whoever reads it, so reading the data of a part holds back no part
 * after it, and the data of every part of a trajectory read to its end has
 * arrived by the time the view ends. A part's data ends where the reading of the
 * trajectory ends: with the trajectory, or with a reading that stops before it.
 *
 * The stream fails with the trajectory's failure — `E` on top of the
 * {@link TrajectoryError} a recorded trajectory fails with — and requires the
 * services `R` names, which the data of its parts fails with and requires as
 * well.
 *
 * **Example** (Reading a recording by what each of its parts is worth)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Extensionkit, Trajectory, View } from "@trajs/core"
 *
 * const kit = { tool: Toolkit.empty, ext: Extensionkit.empty }
 * const variant = { ext: true, stream: false } as const
 * const derivedPart = Trajectory.DerivedPart(kit.ext)
 *
 * const prompt = Trajectory.promptPart(Prompt.make("Hello"), Trajectory.rootSession)
 * const count = derivedPart.make({
 *   extension: { extension: "org.js.tra.count", data: { version: "0.1.0", tokens: 1 } },
 *   attach: [prompt.uuid]
 * })
 *
 * const trajectory = Trajectory.make(Stream.make(prompt, count), kit, variant)
 *
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(View.attached(trajectory))))
 * parts.length // => 1
 * parts[0]._tag // => "Prompt"
 * const data = Array.from(await Effect.runPromise(Stream.runCollect(parts[0].derived)))
 * data.length // => 1
 * ```
 *
 * @see {@link AttachedPart} — the parts it emits.
 * @see {@link Extensionkit.produce} — derive the data it reads.
 * @category combinators
 */
export const attached = <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R>(
  trajectory: Trajectory.TrajectoryStream<K, V, E, R>,
): Stream.Stream<AttachedPart<K, V, E, R>, E | TrajectoryError, R> =>
  Effect.gen(function* () {
    const view = yield* Queue.unbounded<
      AttachedPart<K, V, E, R>,
      E | TrajectoryError | Cause.Done
    >();

    // Data is attached by uuid rather than by where it was recorded, so a part's
    // data is the data that names it, in the order the trajectory records it,
    // whether or not the part itself has been read yet.
    const opened = new Map<
      string,
      Queue.Queue<Trajectory.DerivedPart<K["ext"]>, E | TrajectoryError | Cause.Done>
    >();

    const dataOf = (
      uuid: string,
    ): Effect.Effect<
      Queue.Queue<Trajectory.DerivedPart<K["ext"]>, E | TrajectoryError | Cause.Done>
    > =>
      Effect.gen(function* () {
        let data = opened.get(uuid);

        if (data === undefined) {
          data = yield* Queue.unbounded<
            Trajectory.DerivedPart<K["ext"]>,
            E | TrajectoryError | Cause.Done
          >();

          opened.set(uuid, data);
        }

        return data;
      });

    const readPart = (part: Trajectory.Part<K, V>): Effect.Effect<void> =>
      dataOf(part.uuid).pipe(
        // The data is attached to a copy of the part rather than to the recorded
        // part itself, which whoever else reads the trajectory holds as well.
        Effect.flatMap((data) =>
          Queue.offer(view, Object.assign({}, part, { derived: Stream.fromQueue(data) })),
        ),
      );

    const readData = (extension: Trajectory.DerivedPart<K["ext"]>): Effect.Effect<void> =>
      Effect.forEach(
        extension.attach,
        (uuid) => dataOf(uuid).pipe(Effect.flatMap((data) => Queue.offer(data, extension))),
        { discard: true },
      );

    const close = (exit: Exit.Exit<unknown, E | TrajectoryError>): Effect.Effect<void> => {
      // A reading of the trajectory that ends, or that is interrupted where
      // whoever reads the view leaves it, ends the data of its parts with it,
      // while a trajectory that fails fails the data of its parts, since no
      // more of it can arrive.
      const end = Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause);

      const finish = <A>(queue: Queue.Queue<A, E | TrajectoryError | Cause.Done>) =>
        end ? Queue.end(queue) : Queue.failCause(queue, exit.cause);

      return Effect.forEach(opened.values(), finish, { discard: true }).pipe(
        Effect.flatMap(() => finish(view)),
      );
    };

    return Stream.fromQueue(view).pipe(
      // The trajectory is read while the view is read, whether or not whoever
      // reads the view reads the data of the parts it has taken, and a
      // trajectory that fails fails the view it is read into.
      Stream.drainFork(
        trajectory.pipe(
          Stream.tap((part) => (part._tag === "Derived" ? readData(part) : readPart(part))),
          // A trajectory that fails reaches no end, so a part's data ends or
          // fails with the trajectory rather than leaving a reader waiting for
          // data that cannot arrive.
          Stream.onExit(close),
          Stream.drain,
        ),
      ),
    );
  }).pipe(Stream.unwrap);
