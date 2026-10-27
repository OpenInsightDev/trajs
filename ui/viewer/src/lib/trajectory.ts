/**
 * Reading the bytes of a `.trajs` file as what the viewer shows.
 *
 * A trajectory is one stream of parts, and what a viewer shows of one is not that
 * stream: it is the sessions it declares, the forks that relate them, and the turns each
 * of them ran — `@trajs/core`'s `Session.main` and `View`. The bytes and the
 * kits to read them with are the exchange's work, and what this adds is the shape the
 * components read: one session at a time, with what it inherited from the sessions it
 * continues from read as the turns those sessions had reached by then.
 *
 * A trajectory is read with no tools, no events, no metrics and no extra data: its
 * header names the kits it was written with, and what a kit states of a part is read by
 * a reading that names that kit alone, so a metric or event part of a kind the header
 * names without stating is stepped over, and the extra data of a part is held as far as
 * the reading names the kinds of it. What a viewer shows of a trajectory is therefore
 * the parts that are its own rather than those a kit made of it.
 */

import { Cache, Session, View } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import * as Exchange from "@trajs/core/Exchange";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";
import { BrowserServices } from "@trajs/platform-browser";
import { makeByte } from "@trajs/utils/Byte";
import { Storage, StorageError } from "@trajs/utils/Storage";
import { Effect, Layer, Match, Option, Predicate, Sink, Stream } from "effect";

/**
 * What reading a trajectory fails with: the trajectory's own failure, or the cache its
 * parts are kept in while its sessions are read.
 */
type Failure = TrajectoryError | StorageError | Cache.CacheError;

/** Empty kits. A part a kit made is stepped over. */
const config = Config.config();

type ViewerConfig = typeof config;

type SessionOf = Session.AnySession<ViewerConfig, Failure, Config.DecodingServices<ViewerConfig>>;

type PartStream = Session.SessionStream<
  ViewerConfig,
  Failure,
  Config.DecodingServices<ViewerConfig>
>;

/** The id a page serves a trajectory it was handed under: a page is handed the bytes, not a name. */
const Handed = "handed";

/**
 * The storage a page serves a trajectory it was handed out of: the bytes it was
 * given, under one id. A page reads a trajectory rather than writing one, so what it
 * writes through fails.
 */
const handed = (bytes: Uint8Array): Storage => ({
  read: () =>
    Effect.succeed(
      makeByte({
        length: Effect.succeed(BigInt(bytes.length)),
        read: (buffer, { offset = 0n } = {}) =>
          Effect.sync(() => {
            const taken = bytes.subarray(Number(offset), Number(offset) + buffer.length);

            buffer.set(taken);

            return taken.length;
          }),
      }),
    ),
  write: () => Sink.fail(new StorageError({ id: Handed, cause: "a page only reads a trajectory" })),
});

/** The exchange a page reads through: its own codecs, over the services a page runs. */
const browserExchange = Layer.provide(Exchange.layer, BrowserServices.layer);

/** One turn of a session's conversation: what a model was given, and what it answered. */
export type Turn = Readonly<{
  prompt: View.PromptStep<Config.AnyConfig>["prompt"];
  response: View.ResponseStep<Config.AnyConfig>["response"];
}>;

/**
 * One stretch of a conversation: the turns one session produced.
 *
 * A session's conversation is every stretch of the sessions it continues from,
 * from the root down, and then its own.
 */
export interface Stretch {
  readonly sessionId: string;
  readonly turns: ReadonlyArray<Turn>;
}

/**
 * Where a session continues from: the session that produced the part, and the part
 * itself — which is what tells a reader where the conversation it inherited ends
 * and its own begins.
 */
export interface Continuation {
  readonly sessionId: string;
  readonly partUuid: string;
}

/**
 * One session of a trajectory, as a viewer reads it: what it produced for itself,
 * what it inherited from the sessions it continues from, and what was forked off it.
 *
 * A fork holds none of the parts of the sessions it continues from, so the turns it
 * inherited are read from those sessions up to the part each of them is continued from
 * rather than held here as its own ({@link Stretch}).
 */
export interface TrajectorySession {
  readonly id: string;
  /** The turns this session produced, in the order it produced them. */
  readonly turns: ReadonlyArray<Turn>;
  /** The stretches of the conversation it inherited, from the root down. */
  readonly inherited: ReadonlyArray<Stretch>;
  readonly continuesFrom: Option.Option<Continuation>;
  /** The sessions forked off it, each continuing from one of its parts. */
  readonly forks: ReadonlyArray<TrajectorySession>;
}

/** A trajectory, as the viewer reads it. */
export interface Trajectory {
  readonly roots: ReadonlyArray<TrajectorySession>;
}

/** The turns read so far, and the turn the latest prompt opened. */
interface Assembly {
  readonly turns: ReadonlyArray<Turn>;
  readonly open: Option.Option<Turn>;
}

/** A metric part carries no `uuid`, so it never ends the prefix. */
const endsAt =
  (uuid: string) =>
  (part: { readonly _tag: string; readonly uuid?: string }): boolean =>
    !Predicate.isTagged("Metric")(part) && part.uuid === uuid;

/** `takeUntil` would keep the whole stream when `until` names no part. */
const bounded = (stream: PartStream, until?: string): Effect.Effect<PartStream, Failure> => {
  if (until === undefined) return Effect.succeed(stream);

  const ends = endsAt(until);

  return stream.pipe(
    Stream.takeUntil(ends),
    Stream.runFold(
      () => false,
      (found, part) => found || ends(part),
    ),
    Effect.map((found) => (found ? stream.pipe(Stream.takeUntil(ends)) : Stream.empty)),
  );
};

const turnsOf = (stream: PartStream, until?: string): Effect.Effect<ReadonlyArray<Turn>, Failure> =>
  bounded(stream, until).pipe(
    Effect.flatMap((parts) =>
      View.steps(parts).pipe(
        Stream.runFold(
          (): Assembly => ({ turns: [], open: Option.none() }),
          (assembly, step) =>
            Match.value(step).pipe(
              Match.tag("Prompt", (prompt) => ({
                turns: Option.isSome(assembly.open)
                  ? [...assembly.turns, assembly.open.value]
                  : assembly.turns,
                open: Option.some({ prompt: prompt.prompt, response: [] }),
              })),
              Match.tag("Response", (response) =>
                Option.isNone(assembly.open)
                  ? assembly
                  : {
                      turns: assembly.turns,
                      open: Option.some({
                        prompt: assembly.open.value.prompt,
                        response: [...assembly.open.value.response, ...response.response],
                      }),
                    },
              ),
              // An event is not a turn, so it neither opens nor closes one.
              Match.tag("Event", () => assembly),
              Match.exhaustive,
            ),
        ),
        Effect.map(({ turns, open }): ReadonlyArray<Turn> =>
          Option.isSome(open) ? [...turns, open.value] : turns,
        ),
      ),
    ),
  );

/** Ancestor stretches from the root down, stopping before `session`. */
const inheritedOf = (
  session: SessionOf,
): ReadonlyArray<{ sessionId: string; stream: PartStream; until: string }> => {
  const chain: Array<{ sessionId: string; stream: PartStream; until: string }> = [];

  let current: SessionOf = session;

  while ("forkFrom" in current) {
    chain.push({
      sessionId: current.forkFrom.session.id,
      stream: current.forkFrom.session.stream,
      until: current.forkFrom.uuid,
    });

    current = current.forkFrom.session;
  }

  chain.reverse();

  return chain;
};

/**
 * One session as the viewer reads it, and the sessions forked off it.
 *
 * Each reading of a session is read as the turns it produced, so the turns a session inherited are
 * read off the session that produced them rather than looked up by an id.
 */
const readSession = (session: SessionOf): Effect.Effect<TrajectorySession, Failure> =>
  Effect.gen(function* () {
    return {
      id: session.id,
      turns: yield* turnsOf(session.stream),
      inherited: yield* Effect.forEach(inheritedOf(session), (inherited) =>
        turnsOf(inherited.stream, inherited.until).pipe(
          Effect.map((turns) => ({ sessionId: inherited.sessionId, turns })),
        ),
      ),
      continuesFrom:
        "forkFrom" in session
          ? Option.some({
              sessionId: session.forkFrom.session.id,
              partUuid: session.forkFrom.uuid,
            })
          : Option.none(),
      forks: yield* Effect.forEach(Object.values(session.forkBy), readSession),
    };
  });

/**
 * Reads the bytes of a trajectory as the sessions it holds.
 *
 * **When to use**
 *
 * Use to read a `.trajs` file a page was handed — a dropped file, one fetched
 * from somewhere — as what the components show.
 *
 * **Details**
 *
 * The page is handed one trajectory, so it serves it under one id: the exchange the
 * bytes are read through is provided with the codecs a page runs — the WebAssembly
 * compression and hash `@trajs/platform-browser` states — and with a storage over
 * the bytes themselves. Loading reads the head of them for what the trajectory was
 * made with, and `read` reads the parts, which is what the exchange reads a
 * trajectory into. What the parts are kept in while the sessions are read is the store
 * `Cache.layer` states where a program states none: the parts are kept in
 * memory for as long as the page runs, which is as long as the sessions are shown. It
 * takes a `Uint8Array` rather than a stream because a `.trajs` file is what a page
 * reads, and a file is read whole.
 */
export const read = (bytes: Uint8Array): Effect.Effect<Trajectory, Failure> =>
  Effect.gen(function* () {
    const exchange = yield* Exchange.Exchange;

    const loaded = yield* exchange.load(config)(Handed);

    const root = yield* Session.main(loaded.read());

    // A reading of a trajectory is one tree, so a page is shown one root.
    return {
      roots: [yield* readSession(root)],
    };
  }).pipe(
    Effect.provide(Cache.layer()),
    Effect.provide(Layer.provide(browserExchange, Layer.succeed(Storage, handed(bytes)))),
  );
