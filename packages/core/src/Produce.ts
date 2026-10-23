import { Cause, DateTime, Effect, Exit, Queue, Stream } from "effect";

import * as Config from "#/Config.ts";
import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import { uuid } from "#/internal/trajectory.ts";
import * as Metric from "#/Metric.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Tool from "#/Tool.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

export type MessageStream<Config extends Config.AnyConfig, E = never, R = never> = Stream.Stream<
  | Trajectory.PromptPart<Config["extrakit"]>
  | Trajectory.ResponsePart<Config["toolkit"], Config["extrakit"], boolean>
  | Trajectory.EventPart<Config["eventkit"]>,
  E,
  R
>;

export type SessionSource<Config extends Config.AnyConfig, E = never, R = never> = Readonly<{
  messages: MessageStream<Config, E, R>;
  subTo?: string;
}> &
  Extra.ExtraRecord<Config.ExtrasOf<Config>, "session">;

export type SessionStreams<Config extends Config.AnyConfig, E = never, R = never> = Readonly<{
  main: SessionSource<Config, E, R> & { readonly subTo?: never };
}> &
  Readonly<Record<string, SessionSource<Config, E, R>>>;

export type ProducingConfig<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
> = Config.Config<boolean, Toolkit, Events, MetricKit.WithProducers<Metrics>, Extras>;

type ProducedConfig<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
> = Config.Config<true, Toolkit, Events, MetricKit.WithProducers<Metrics>, Extras>;

const produced = <
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): ProducedConfig<Toolkit, Events, Metrics, Extras> => Config.config({ ...config, stream: true });

const produceWith =
  <
    Toolkit extends Toolkit.Any,
    Events extends EventKit.Any,
    Metrics extends MetricKit.Any,
    Extras extends ExtraKit.Any,
  >(
    id: string | undefined,
    config: ProducedConfig<Toolkit, Events, Metrics, Extras>,
  ) =>
  <E, R>(
    stream: Trajectory.TrajectoryStream<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
  ): Trajectory.Trajectory<
    string,
    ProducedConfig<Toolkit, Events, Metrics, Extras>,
    E | TrajectoryError,
    R
  > => {
    const parts = Trajectory.parts(config);

    return stream.pipe(
      // The trajectory is read twice — as the parts of the trajectory, and by the
      // producers the metric kit runs over it — so one subscription is shared
      // between the two readings rather than the producer behind them, which may drive a
      // model, being run twice.
      Stream.broadcastN({ n: 2, capacity: "unbounded" }),
      Effect.map(([produced, producing]) =>
        Stream.merge(
          produced,
          producing.pipe(
            // The config here streams, and a producer reads whole parts:
            // `Metric.produce` folds the increments before a producer reads them.
            Metric.produce(config.metrickit),
            // What a kit derived is produced as the part of an event-less kind it is,
            // built the way every part of the trajectory is.
            Stream.map((metric) => parts.metric(metric)),
          ),
        ),
      ),
      Stream.unwrap,
      Trajectory.make(id ?? uuid(), config),
    );
  };

export function fromSession<
  Id extends string,
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  id: Id,
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): <E, R>(
  stream: MessageStream<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
) => Trajectory.Trajectory<
  Id,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function fromSession<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): <E, R>(
  stream: MessageStream<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
) => Trajectory.Trajectory<
  string,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function fromSession<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  ...args:
    | [id: string, config: ProducingConfig<Toolkit, Events, Metrics, Extras>]
    | [config: ProducingConfig<Toolkit, Events, Metrics, Extras>]
) {
  const [id, config] = args.length === 1 ? [undefined, args[0]] : args;

  return produceWith(id, produced(config));
}

export function fromSessions<
  Id extends string,
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  id: Id,
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): <E, R>(
  sessions: SessionStreams<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
) => Trajectory.Trajectory<
  Id,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function fromSessions<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): <E, R>(
  sessions: SessionStreams<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
) => Trajectory.Trajectory<
  string,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function fromSessions<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  ...args:
    | [id: string, config: ProducingConfig<Toolkit, Events, Metrics, Extras>]
    | [config: ProducingConfig<Toolkit, Events, Metrics, Extras>]
) {
  const [id, config] = args.length === 1 ? [undefined, args[0]] : args;
  const read = produced(config);
  const part = Trajectory.parts(read);

  return <E, R>(
    sessions: SessionStreams<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
  ) => {
    const extraOf = (
      source: SessionSource<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
    ): Extra.ExtraRecord<Extras["extra"], "session"> =>
      Extra.stated(read.extrakit, "session")(source);

    const main = part.mainSession(extraOf(sessions.main));
    const mainId = Trajectory.mainSessionId;

    // A session is declared after the session it is forked from, so the declarations are
    // produced in the order `subTo` states: the main session first, and each session once
    // the session it names is declared, forking from that session's declaration.
    const declarations = [main];
    const declarationOf = new Map([[mainId, main.uuid]]);
    const waiting = new Map(Object.entries(sessions));
    waiting.delete(mainId);

    while (waiting.size > 0) {
      const ready = [...waiting].flatMap(([sessionId, source]) => {
        const fork = declarationOf.get(source.subTo ?? mainId);

        return fork === undefined ? [] : [[sessionId, source, fork] as const];
      });

      // A `subTo` naming a session the record does not state — or sessions naming each
      // other — is a session no declaration of which can be read before another.
      if (ready.length === 0) {
        const [unreachable] = waiting.keys();

        const failed = Stream.fail(
          TrajectoryError.session(unreachable ?? mainId, "unproduced-fork"),
        );

        return produceWith(id, read)(failed);
      }

      for (const [sessionId, source, fork] of ready) {
        const declaration = part.subSession(sessionId, { fork, ...extraOf(source) });

        declarations.push(declaration);
        declarationOf.set(sessionId, declaration.uuid);
        waiting.delete(sessionId);
      }
    }

    const streams = Stream.mergeAll(
      [
        sessions.main.messages,
        ...Object.entries(sessions)
          .filter(([sessionId]) => sessionId !== mainId)
          .map(([, source]) => source.messages),
      ],
      { concurrency: "unbounded" },
    );

    return produceWith(id, read)(Stream.make(...declarations).pipe(Stream.concat(streams)));
  };
}

export type ProduceSession<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
> = Readonly<{
  id: string;
  enqueuePrompt: (
    message: Prompt.Prompt,
    options?: Extra.ExtraRecord<Extras, "prompt">,
    timestamp?: DateTime.Utc,
  ) => Effect.Effect<Trajectory.PromptPart<ExtraKit.Kit<Extras>>>;
  enqueueResponse: (
    response: Response.AllPartsView<Tools>,
    options?: Extra.ExtraRecord<Extras, "response">,
    timestamp?: DateTime.Utc,
  ) => Effect.Effect<Trajectory.ResponsePart<Toolkit.Toolkit<Tools>, ExtraKit.Kit<Extras>, true>>;
  enqueueEvent: (
    event: Event.EventParts<Events>,
  ) => Effect.Effect<Trajectory.EventPart<EventKit.Eventkit<Events>>>;
  forkSession: (
    options: { id: string; fork?: string } & Extra.ExtraRecord<Extras, "session">,
  ) => Effect.Effect<ProduceSession<Tools, Events, Extras>, TrajectoryError>;
}>;

type ProduceFn<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
  E = never,
  R = never,
> = (main: ProduceSession<Tools, Events, Extras>) => Effect.Effect<void, E, R>;

export function produce<
  Id extends string,
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  id: Id,
  config: ProducingConfig<Toolkit, Events, Metrics, Extras> &
    Extra.ExtraRecord<Extras["extra"], "session">,
): <E, R>(
  fn: ProduceFn<Toolkit["tools"], Events["events"], Extras["extra"], E, R>,
) => Trajectory.Trajectory<
  Id,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function produce<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  config: ProducingConfig<Toolkit, Events, Metrics, Extras> &
    Extra.ExtraRecord<Extras["extra"], "session">,
): <E, R>(
  fn: ProduceFn<Toolkit["tools"], Events["events"], Extras["extra"], E, R>,
) => Trajectory.Trajectory<
  string,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function produce<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  ...args:
    | [
        id: string,
        config: ProducingConfig<Toolkit, Events, Metrics, Extras> &
          Extra.ExtraRecord<Extras["extra"], "session">,
      ]
    | [
        config: ProducingConfig<Toolkit, Events, Metrics, Extras> &
          Extra.ExtraRecord<Extras["extra"], "session">,
      ]
): <E, R>(
  fn: ProduceFn<Toolkit["tools"], Events["events"], Extras["extra"], E, R>,
) => Trajectory.Trajectory<
  string,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
> {
  const [id, config] = args.length === 1 ? [undefined, args[0]] : args;
  const read = produced(config);
  const part = Trajectory.parts(read);

  // The extra data the kit declares of a session part is stated beside the config, and is
  // declared with the main session: the one the program is handed.
  const sessionExtra = Extra.stated(read.extrakit, "session")(config);

  return (fn) => {
    // The queue only ever ends rather than fails — a run that fails fails the
    // trajectory through the fork — so its failure type is the end alone.
    const trajectory = Effect.gen(function* () {
      const parts = yield* Queue.unbounded<
        Trajectory.Part<ProducedConfig<Toolkit, Events, Metrics, Extras>>,
        Cause.Done
      >();

      const declared = new Set<string>();
      const forkable = new Set<string>();

      const enqueue = <
        P extends Trajectory.Part<ProducedConfig<Toolkit, Events, Metrics, Extras>> & {
          readonly uuid: string;
        },
      >(
        written: P,
      ): Effect.Effect<P> =>
        Effect.gen(function* () {
          yield* Queue.offer(parts, written);

          // A `fork` names a part a session continues from, so an event is written
          // without being remembered to fork from.
          if (written._tag !== "Event") {
            forkable.add(written.uuid);
          }

          return written;
        });

      const mainDeclaration = part.mainSession(sessionExtra);

      const session = (
        stated: string | undefined,
        declaration: string,
      ): ProduceSession<Toolkit["tools"], Events["events"], Extras["extra"]> => ({
        id: stated ?? Trajectory.mainSessionId,
        enqueuePrompt: (prompt, extra = {}, timestamp) =>
          enqueue(part.prompt(prompt, { sessionId: stated, timestamp, ...extra })),
        enqueueResponse: (response, extra = {}, timestamp) =>
          enqueue(part.response(response, { sessionId: stated, timestamp, ...extra })),
        enqueueEvent: (event) => enqueue(part.event(event, { sessionId: stated })),
        forkSession: ({ id: sessionId, fork, ...extra }) =>
          Effect.gen(function* () {
            // A session is declared before the parts it produces, so a declaration of
            // an id a session was opened under already is read after the parts of that
            // session.
            if (declared.has(sessionId)) {
              return yield* Effect.fail(TrajectoryError.session(sessionId, "late-declaration"));
            }

            // A `fork` names a part a session continues from: the declaration of this
            // session where none is stated, and otherwise a part the run wrote as one.
            const continuing = fork ?? declaration;

            if (!forkable.has(continuing)) {
              return yield* Effect.fail(TrajectoryError.session(sessionId, "unproduced-fork"));
            }

            declared.add(sessionId);

            const extraData = Extra.stated(read.extrakit, "session")(extra);

            const opened = yield* enqueue(
              part.subSession(sessionId, { fork: continuing, ...extraData }),
            );

            return session(sessionId, opened.uuid);
          }),
      });

      // The main session is declared before the program runs, so every part it writes is
      // read in a session the trajectory already names.
      yield* enqueue(mainDeclaration);
      declared.add(Trajectory.mainSessionId);

      const program = fn(session(undefined, mainDeclaration.uuid)).pipe(
        Effect.onExit((exit) =>
          Exit.isSuccess(exit) ? Queue.end(parts).pipe(Effect.asVoid) : Effect.void,
        ),
        Stream.fromEffectDrain,
      );

      return Stream.fromQueue(parts).pipe(Stream.drainFork(program));
    });

    return produceWith(id, read)(trajectory.pipe(Stream.unwrap));
  };
}
