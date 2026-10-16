/**
 * Reading the bytes of a `.trajs` file as what the viewer shows.
 *
 * A recording is one stream of parts, and what a viewer shows of one is not that
 * stream: it is the sessions it declares, the forks that relate them, and the
 * turns each of them ran — `@trajs/core`'s `Session` and `View`. The bytes and the
 * kits to read them with are the exchange's work, and what this adds is the shape
 * the components read: one session at a time, with what it inherited from the
 * session it continues from read as the turns that session had reached by then.
 *
 * A recording is read with no tools, no events, no metrics and no extra data: its
 * header names the kits it was written with, and a part is read as itself whatever
 * kit it was written with, so the parts a viewer shows do not take the kits to
 * know.
 */

import { Session, Trajectory, View } from "@trajs/core";
import { Exchange } from "@trajs/core/Exchange";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";
import { BrowserServices } from "@trajs/platform-browser";
import { makeBytes } from "@trajs/utils/Bytes";
import { Storage, StorageError } from "@trajs/utils/Storage";
import { Effect, Layer, Option, Sink, type Scope, Stream } from "effect";

/**
 * What reading a recording fails with: the recording's own failure, or the storage
 * it is read from — the bytes a page was handed may not hold a recording.
 */
type Failure = TrajectoryError | StorageError;

/** The id a page serves a recording it was handed under: a page is handed the bytes, not a name. */
const Handed = "handed";

/**
 * The storage a page serves a recording it was handed out of: the bytes it was
 * given, under one id. A page reads a recording rather than writing one, so what it
 * writes through fails.
 */
const handed = (bytes: Uint8Array): Storage => ({
  read: () =>
    Effect.succeed(
      makeBytes({
        length: Effect.succeed(BigInt(bytes.length)),
        read: (buffer, { offset = 0n } = {}) =>
          Effect.sync(() => {
            const taken = bytes.subarray(Number(offset), Number(offset) + buffer.length);

            buffer.set(taken);

            return taken.length;
          }),
      }),
    ),
  write: () => Sink.fail(new StorageError({ id: Handed, cause: "a page only reads a recording" })),
});

/** One turn of a session's conversation: what a model was given, and what it answered. */
export type Turn = View.PromptTurn<Trajectory.AnyConfig>;

type Part = Trajectory.Part<Trajectory.AnyConfig>;

/**
 * One stretch of a conversation: the turns one session recorded.
 *
 * A session's conversation is every stretch of the sessions it continues from,
 * from the root down, and then its own.
 */
export interface Stretch {
  readonly sessionId: string;
  readonly turns: ReadonlyArray<Turn>;
}

/**
 * Where a session continues from: the session that recorded the part, and the part
 * itself — which is what tells a reader where the conversation it inherited ends
 * and its own begins.
 */
export interface Continuation {
  readonly sessionId: string;
  readonly partUuid: string;
}

/**
 * One session of a recording, as a viewer reads it: what it recorded for itself,
 * what it inherited from the session it continues from, and what was forked off it.
 *
 * A fork holds none of the parts of the session it continues from, so the turns it
 * inherited are read from that session up to the part it continues from rather than
 * held here as its own ({@link Stretch}).
 */
export interface RecordedSession {
  readonly id: string;
  /** The turns this session recorded, in the order it recorded them. */
  readonly turns: ReadonlyArray<Turn>;
  /** The stretches of the conversation it inherited, from the root down. */
  readonly inherited: ReadonlyArray<Stretch>;
  readonly continuesFrom: Option.Option<Continuation>;
  /** The sessions forked off it, each continuing from one of its parts. */
  readonly forks: ReadonlyArray<RecordedSession>;
}

/** A recording, as the viewer reads it. */
export interface Recording {
  readonly roots: ReadonlyArray<RecordedSession>;
}

/**
 * The `uuid` a part is identified by, which is what a `fork` names it with. A metric
 * part is the one part of a recording that names no session and holds no `uuid`, so
 * it is read as naming none: a `fork` names a part of a session, and is never one.
 */
const uuidOf = (part: Part): string => (part._tag === "Metric" ? "" : part.uuid);

/** The parts of a session up to and including the one `uuid` names. */
const partsUpTo = (parts: ReadonlyArray<Part>, uuid: string): ReadonlyArray<Part> => {
  const at = parts.findIndex((part) => uuidOf(part) === uuid);

  return at === -1 ? parts : parts.slice(0, at + 1);
};

/** The turns a session's parts were recorded in, folded the way a recording is read. */
const turnsOf = (parts: ReadonlyArray<Part>): Effect.Effect<ReadonlyArray<Turn>> =>
  Stream.runCollect(View.promptTurns(Stream.fromIterable(parts))).pipe(
    Effect.map((turns) => Array.from(turns)),
  );

/**
 * One session as the viewer reads it, over the stretches it inherited.
 *
 * A session is read from the sessions handed out by {@link Session.sessions}, which
 * route the parts of a recording to the session that names them as it is read, so
 * the parts of a session are taken by this one reader rather than read again.
 */
const readSession = (
  session: Session.AnySession,
  inherited: ReadonlyArray<Stretch>,
): Effect.Effect<RecordedSession, Failure, Scope.Scope> =>
  Effect.gen(function* () {
    const parts = Array.from(yield* Stream.runCollect(session.parts));
    const forks = Array.from(yield* Stream.runCollect(session.forkedBy));

    const readForks = yield* Effect.forEach(forks, (forked) =>
      Effect.gen(function* () {
        // A fork holds none of the parts of the session it continues from, so what
        // it inherited is that session's conversation as far as the part it
        // continues from: the stretches already read, and its own up to there.
        const continues = yield* Option.match(forked.forkedFrom, {
          onNone: () => Effect.succeed(inherited),
          onSome: (fork) =>
            turnsOf(partsUpTo(parts, uuidOf(fork.part))).pipe(
              Effect.map((turns) => [...inherited, { sessionId: session.id, turns }]),
            ),
        });

        return yield* readSession(forked, continues);
      }),
    );

    return {
      id: session.id,
      turns: yield* turnsOf(parts),
      inherited,
      continuesFrom: Option.map(session.forkedFrom, (fork) => ({
        sessionId: fork.session.id,
        partUuid: uuidOf(fork.part),
      })),
      forks: readForks,
    };
  });

/**
 * Reads the bytes of a recording as the sessions it holds.
 *
 * **When to use**
 *
 * Use to read a `.trajs` file a page was handed — a dropped file, one fetched
 * from somewhere — as what the components show. It is seen in a scope, since
 * reading a recording reads its sessions as it arrives rather than once it has
 * ended.
 *
 * **Details**
 *
 * The page is handed one recording, so it serves it under one id: the exchange the
 * bytes are read through is provided with the codecs a page runs — the WebAssembly
 * compression and hash `@trajs/platform-browser` states — and with a storage over
 * the bytes themselves. Loading reads the head of them for what the recording was
 * made with, and `read` reads the parts, which is what the exchange reads a
 * recording into. It takes a `Uint8Array` rather than a stream because a `.trajs`
 * file is what a page reads, and a file is read whole.
 */
export const read = (bytes: Uint8Array): Effect.Effect<Recording, Failure, Scope.Scope> =>
  Effect.gen(function* () {
    const exchange = yield* Exchange;

    const loaded = yield* exchange.load(Handed);

    const roots = yield* Stream.runCollect(Session.sessions(loaded.read()));

    return {
      roots: yield* Effect.forEach(roots, (session) => readSession(session, [])),
    };
  }).pipe(
    Effect.provide(
      Layer.provide(
        Layer.provide(Exchange.layer, BrowserServices.layer),
        Layer.succeed(Storage, handed(bytes)),
      ),
    ),
  );
