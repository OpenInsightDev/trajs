/**
 * Recording what a program does with a model as a trajectory.
 *
 * {@link transform} records the parts of a session that is already a stream as a
 * trajectory, and {@link produce} records a run as it happens. Either runs the
 * producers of the metric kit over what it records, so what a kit derives of a
 * recording is recorded among the parts it is about.
 */

import { Effect, Stream } from "effect";

import * as Event from "#/Event.ts";
import * as Extra from "#/Extra.ts";
import * as Metric from "#/Metric.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Tool from "#/Tool.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";

import type { TrajectoryError } from "./TrajectoryError.ts";

/**
 * The parts a trajectory is recorded from: what a model was given and returned,
 * and the events a kit recorded of the session.
 *
 * **When to use**
 *
 * Use to type what {@link transform} records.
 *
 * **Details**
 *
 * A part is stated as the trajectory records it — a prompt, response or event
 * part, carrying the `uuid` it is named by and the session it was recorded in — so
 * a stream of them holds the parts themselves rather than the messages they were
 * built from. A session declaration is not among them: a part names the session it
 * belongs to, and a recording is read by the sessions its parts name whether or not
 * one of them is declared.
 *
 * @see {@link transform} for the function that records them.
 * @category models
 */
export type PartStream<Config extends Trajectory.AnyConfig, E = never, R = never> = Stream.Stream<
  | Trajectory.PromptPart<Config["extrakit"]>
  | Trajectory.ResponsePart<Config["toolkit"], Config["extrakit"], true>
  | Trajectory.EventPart<Config["eventkit"]>,
  E,
  R
>;

/**
 * Records the parts of a session as a trajectory, with the metric parts a kit
 * derives of them.
 *
 * **When to use**
 *
 * Use when what a model was given and returned is already a stream of parts — a
 * session recorded elsewhere, or parts a caller assembled — and it should read as
 * a trajectory rather than as the parts it holds: so that its sessions read as one
 * recording, the kits and the metadata it was recorded with travel with its parts,
 * and what a kit derives of it is recorded among the parts it is about.
 *
 * **Details**
 *
 * - Each part is recorded as it arrives, in the order the stream gives it, and the
 *   trajectory carries the kits and the metadata given.
 * - The producers the metric kit was provided with are run over the same parts as
 *   they arrive, exactly as {@link Metric.produce} runs them, and the metric parts
 *   they derive are recorded among the parts they are about. The stream is read
 *   once — the parts and the producers each read a branch of one broadcast — so a
 *   stream that drives a model is not run twice.
 * - The failure a producer reports of a part is recorded as the failure of its
 *   metric rather than failing the recording; a failure of the run itself fails the
 *   trajectory, as {@link Metric.produce} states.
 *
 * **Example** (Recording the parts of a session, with what a kit derives of them)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Event, Extra, Metric, Produce, Prompt, Toolkit, Trajectory, VersionedSchema } from "@trajs/core"
 *
 * const count = new Metric.Metric({
 *   package: "tokenize",
 *   id: "count",
 *   metadata: new Metric.Metadata({ name: "Count" }),
 *   output: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make),
 *   failure: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     reason: Schema.String
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * // What the metric is reported by: one count of each part the kit reads. The
 * // producer is run by the kit beside the stream that records the parts, so the
 * // counts it derives are recorded among them.
 * const counting: Metric.Producer<typeof count> = (parts) =>
 *   parts.pipe(Stream.map(() =>
 *     Metric.makeOutput<typeof count>({ version: "0.1.0", tokens: 1 }, {
 *       attach: ["01890a5d-ac96-774b-bcce-b302099a8057"]
 *     })
 *   ))
 *
 * const metrickit = Metric.toProducers(Metric.makeKit(count), {
 *   "tokenize/count": counting
 * })
 *
 * const extrakit = Extra.makeKit()
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 *
 * const recorded = Produce.transform({
 *   toolkit: Toolkit.empty,
 *   eventkit: Event.makeKit(),
 *   metrickit,
 *   extrakit,
 *   metadata: new Trajectory.Metadata({ name: "One prompt" })
 * })(Stream.make(
 *   Trajectory.promptPart(extrakit)({ prompt: Prompt.make("What is 2 + 2?"), sessionId })
 * ))
 *
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(recorded)))
 * parts.map((part) => part._tag) // => ["Prompt", "Metric"]
 * ```
 *
 * @see {@link PartStream} for the parts it records.
 * @see {@link produce} for recording a run as it happens.
 * @see {@link Metric.produce} for what a kit derives of a kind of recording.
 * @category constructors
 */
export const transform =
  <
    Toolkit extends Toolkit.Any,
    Eventkit extends Event.AnyKit,
    Metrickit extends Metric.AnyKit,
    Extrakit extends Extra.AnyKit,
  >({
    toolkit,
    eventkit,
    metrickit,
    extrakit,
    metadata,
  }: {
    toolkit: Toolkit;
    eventkit: Eventkit;
    metrickit: Metric.WithProducers<Metrickit>;
    extrakit: Extrakit;
    metadata: Trajectory.Metadata;
  }) =>
  <E, R>(
    stream: PartStream<Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>, E, R>,
  ): Trajectory.Trajectory<
    Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>,
    E | TrajectoryError,
    R
  > =>
    stream.pipe(
      // The recording is read twice — as the parts of the trajectory, and by the
      // producers the metric kit runs over it — so one subscription is shared
      // between the two readings rather than the stream, which may drive a model,
      // being run twice.
      Stream.broadcastN({ n: 2, capacity: "unbounded" }),
      Effect.map(([recorded, producing]) =>
        Stream.merge(
          recorded,
          producing.pipe(
            Metric.produce(metrickit),
            Stream.map((metric) => ({ _tag: "Metric" as const, metric })),
          ),
        ),
      ),
      Stream.unwrap,
      (parts) =>
        Object.assign(parts, {
          metadata,
          stream: true as const,
          toolkit,
          eventkit,
          metrickit,
          extrakit,
        }),
    );

export type ProduceSession<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
> = Readonly<{
  id: string;
  enqueuePrompt: (
    message: Prompt.Prompt,
    options?: Extra.ExtraRecord<Extras, "prompt">,
  ) => Effect.Effect<Trajectory.PromptPart<Extra.Extrakit<Extras>>>;
  enqueueResponse: (
    response: Response.AllPartsView<Tools>,
    options?: Extra.ExtraRecord<Extras, "response">,
  ) => Effect.Effect<Trajectory.ResponsePart<Toolkit.Toolkit<Tools>, Extra.Extrakit<Extras>, true>>;
  enqueueEvent: (
    event: Event.EventPartsView<Events>,
  ) => Effect.Effect<Trajectory.EventPart<Event.Eventkit<Events>>>;
}>;

export type Producer<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
> = Readonly<{
  createSession: (
    options: { id: string; fork?: string } & Extra.ExtraRecord<Extras, "session">,
  ) => Effect.Effect<ProduceSession<Tools, Events, Extras>, TrajectoryError>;
}>;

type ProduceFn<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
  E = never,
  R = never,
> = (producer: Producer<Tools, Events, Extras>) => Effect.Effect<never, E, R>;

export const produce =
  <
    Toolkit extends Toolkit.Any,
    Eventkit extends Event.AnyKit,
    Metrickit extends Metric.AnyKit,
    Extrakit extends Extra.AnyKit,
  >({
    toolkit,
    eventkit,
    metrickit,
    extrakit,
    metadata,
  }: {
    toolkit: Toolkit;
    eventkit: Eventkit;
    metrickit: Metric.WithProducers<Metrickit>;
    extrakit: Extrakit;
    metadata: Trajectory.Metadata;
  }) =>
  <E, R>(
    fn: ProduceFn<Toolkit["tools"], Eventkit["events"], Extrakit["extra"], E, R>,
  ): Trajectory.Trajectory<
    Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>,
    E,
    R
  > => {
    throw new Error("Not implemented");
  };
