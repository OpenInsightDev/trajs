import { Effect, Option, Predicate, Stream } from "effect";
import type { Tool } from "effect/ai";
import type * as Extension from "#/Extension.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/** The sessions of every part recorded so far, keyed by the identifier of the part. */
type Recorded = Map<string, ReadonlyArray<string>>;

/** The parts a session stream has held so far. */
interface Held<Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>> {
  readonly parts: Array<Trajectory.Part<Tools, Exts>>;
  readonly recorded: Recorded;
  readonly started: boolean;
}

/** The parts one step of streaming a session emits. */
type Emitted<
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
> = readonly [Held<Tools, Exts>, ReadonlyArray<Trajectory.Part<Tools, Exts>>];

/** A session together with the session its declaration is forked from. */
interface Edge {
  readonly session: string;
  readonly source: string;
}

/** The sessions of the parts an extension part is attached to. */
const attached = <Exts extends Record<string, Extension.Any>>(
  part: Trajectory.ExtensionPart<Exts>,
  recorded: Recorded,
): ReadonlyArray<string> => {
  const attached = Option.getOrUndefined(part.attach);

  if (attached === undefined) {
    return [];
  }

  const sessions = new Set<string>();

  for (const uuid of attached) {
    for (const session of recorded.get(uuid) ?? []) {
      sessions.add(session);
    }
  }

  return Array.from(sessions);
};

/**
 * The sessions a part belongs to, read from the parts recorded before it.
 *
 * A message part carries the session it was recorded under. An extension part
 * carries none of its own: it belongs to the sessions of the parts it is attached
 * to, which `attach` names, so an attachment to a part that was not recorded
 * before it leaves the part in no session.
 */
const sessionsOf = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  part: Trajectory.Part<Tools, Exts>,
  recorded: Recorded,
): ReadonlyArray<string> => {
  if (Predicate.isTagged("Extension")(part)) {
    return attached(part, recorded);
  }

  return part.session === undefined ? [] : [part.session];
};

/** Records a part and returns the sessions it belongs to. */
const record = <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>>(
  recorded: Recorded,
  part: Trajectory.Part<Tools, Exts>,
): ReadonlyArray<string> => {
  const sessions = sessionsOf(part, recorded);

  recorded.set(part.uuid, sessions);

  return sessions;
};

/** The first part that declares a session. */
const declaration = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  parts: ReadonlyArray<Trajectory.Part<Tools, Exts>>,
  id: string,
): Trajectory.SessionPart | undefined =>
  parts.find(
    (part): part is Trajectory.SessionPart =>
      Predicate.isTagged("Session")(part) && part.session === id,
  );

/** The parts recorded under a session. */
const own = <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>>(
  parts: ReadonlyArray<Trajectory.Part<Tools, Exts>>,
  recorded: Recorded,
  id: string,
): ReadonlyArray<Trajectory.Part<Tools, Exts>> =>
  parts.filter((part) => sessionsOf(part, recorded).includes(id));

/** A session's parts, following its `fork` upward. */
const partsOf = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  id: string,
  parts: ReadonlyArray<Trajectory.Part<Tools, Exts>>,
  recorded: Recorded,
  seen: ReadonlySet<string>,
): Effect.Effect<ReadonlyArray<Trajectory.Part<Tools, Exts>>, TrajectoryError> =>
  Effect.gen(function* () {
    if (seen.has(id)) {
      return yield* Effect.fail(TrajectoryError.session(id, "cycle"));
    }

    const inherited = yield* inheritedOf<Tools, Exts>(id, parts, recorded, new Set(seen).add(id));

    return [...inherited, ...own(parts, recorded, id)];
  });

/** The parts a session inherited: its parent's parts up to the part it is forked from. */
const inheritedOf = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  id: string,
  parts: ReadonlyArray<Trajectory.Part<Tools, Exts>>,
  recorded: Recorded,
  seen: ReadonlySet<string>,
): Effect.Effect<ReadonlyArray<Trajectory.Part<Tools, Exts>>, TrajectoryError> =>
  Effect.gen(function* () {
    const fork = declaration(parts, id)?.fork;

    if (fork === undefined) {
      return [];
    }

    // A fork names a part of another session, and the session is read off that
    // part rather than restated by the fork.
    const source = recorded.get(fork)?.[0];

    if (source === undefined) {
      return [];
    }

    const parent = yield* partsOf<Tools, Exts>(source, parts, recorded, seen);
    const cut = parent.findIndex((part) => part.uuid === fork);

    return cut === -1 ? parent : parent.slice(0, cut + 1);
  });

/** Streams the parts recorded under a session. */
export const select = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  id: string,
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Stream.Stream<Trajectory.Part<Tools, Exts>, TrajectoryError> =>
  trajectory.pipe(
    Stream.mapAccum(
      (): Recorded => new Map(),
      (recorded, part): readonly [Recorded, ReadonlyArray<Trajectory.Part<Tools, Exts>>] => [
        recorded,
        record(recorded, part).includes(id) ? [part] : [],
      ],
    ),
  );

/**
 * Streams a session's parts, holding them until its declaration.
 *
 * The sessions of the parts read are indexed as they are consumed, so the
 * extension data attached to a session's parts is resolved and streamed with
 * them.
 */
export const of = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  id: string,
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Stream.Stream<Trajectory.Part<Tools, Exts>, TrajectoryError> =>
  trajectory.pipe(
    Stream.mapAccumEffect(
      (): Held<Tools, Exts> => ({ parts: [], recorded: new Map(), started: false }),
      (state, part): Effect.Effect<Emitted<Tools, Exts>, TrajectoryError> => {
        const mine = record(state.recorded, part).includes(id);

        if (state.started) {
          return Effect.succeed([state, mine ? [part] : []] as const);
        }

        // Appended in place: the buffer grows to the declaration, and copying it
        // on every step would make holding quadratic in its length.
        state.parts.push(part);

        if (Predicate.isTagged("Session")(part) && part.session === id) {
          return Effect.map(
            inheritedOf<Tools, Exts>(id, state.parts, state.recorded, new Set([id])),
            (inherited) =>
              [
                { parts: [], recorded: state.recorded, started: true },
                [...inherited, part],
              ] as const,
          );
        }

        return Effect.succeed([state, mine ? [part] : []] as const);
      },
    ),
  );

/**
 * Streams each session declaration together with the session it is forked from.
 *
 * The scan keeps the sessions of every part by its identifier as the recording is
 * consumed, because a `fork` names the part it continues from and that part
 * precedes its declaration.
 */
const edges = <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>>(
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Stream.Stream<Edge, TrajectoryError> =>
  trajectory.pipe(
    Stream.mapAccum(
      (): Recorded => new Map(),
      (recorded, part): readonly [Recorded, ReadonlyArray<Edge>] => {
        record(recorded, part);

        if (!Predicate.isTagged("Session")(part)) {
          return [recorded, []];
        }

        const source = part.fork === undefined ? undefined : recorded.get(part.fork)?.[0];

        if (source === undefined || source === part.session) {
          return [recorded, []];
        }

        return [recorded, [{ session: part.session, source }]];
      },
    ),
  );

/** Streams the session a session continues from, at most once. */
export const parent = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  id: string,
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Stream.Stream<string, TrajectoryError> =>
  edges(trajectory).pipe(
    Stream.filter((edge) => edge.session === id),
    Stream.map((edge) => edge.source),
    Stream.take(1),
  );

/** Streams the sessions a session is the parent of. */
export const children = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  id: string,
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Stream.Stream<string, TrajectoryError> =>
  edges(trajectory).pipe(
    Stream.filter((edge) => edge.source === id),
    Stream.map((edge) => edge.session),
  );
