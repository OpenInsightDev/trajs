import { Effect, Predicate, Stream } from "effect";
import type { Tool } from "effect/ai";
import type * as Extension from "#/Extension.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/** The parts a session stream has held so far. */
interface Held<Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>> {
  readonly parts: Array<Trajectory.Part<Tools, Exts>>;
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
  id: string,
): ReadonlyArray<Trajectory.Part<Tools, Exts>> => parts.filter((part) => part.session === id);

/** A session's parts, following its `fork` upward. */
const partsOf = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  id: string,
  parts: ReadonlyArray<Trajectory.Part<Tools, Exts>>,
  seen: ReadonlySet<string>,
): Effect.Effect<ReadonlyArray<Trajectory.Part<Tools, Exts>>, TrajectoryError> =>
  Effect.gen(function* () {
    if (seen.has(id)) {
      return yield* Effect.fail(TrajectoryError.session(id, "cycle"));
    }

    const inherited = yield* inheritedOf<Tools, Exts>(id, parts, new Set(seen).add(id));

    return [...inherited, ...own(parts, id)];
  });

/** The parts a session inherited: its parent's parts up to the part it is forked from. */
const inheritedOf = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  id: string,
  parts: ReadonlyArray<Trajectory.Part<Tools, Exts>>,
  seen: ReadonlySet<string>,
): Effect.Effect<ReadonlyArray<Trajectory.Part<Tools, Exts>>, TrajectoryError> =>
  Effect.gen(function* () {
    const fork = declaration(parts, id)?.fork;

    if (fork === undefined) {
      return [];
    }

    const source = new Map(parts.map((part) => [part.uuid, part])).get(fork)?.session;

    if (source === undefined) {
      return [];
    }

    const parent = yield* partsOf<Tools, Exts>(source, parts, seen);
    const cut = parent.findIndex((part) => part.uuid === fork);

    return cut === -1 ? parent : parent.slice(0, cut + 1);
  });

/** Streams a session's parts, holding them until its declaration. */
export const of = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  id: string,
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Stream.Stream<Trajectory.Part<Tools, Exts>, TrajectoryError> =>
  trajectory.pipe(
    Stream.mapAccumEffect(
      (): Held<Tools, Exts> => ({ parts: [], started: false }),
      (state, part): Effect.Effect<Emitted<Tools, Exts>, TrajectoryError> => {
        if (state.started) {
          return Effect.succeed([state, part.session === id ? [part] : []] as const);
        }

        // Appended in place: the buffer grows to the declaration, and copying it
        // on every step would make holding quadratic in its length.
        state.parts.push(part);

        if (Predicate.isTagged("Session")(part) && part.session === id) {
          return Effect.map(
            inheritedOf<Tools, Exts>(id, state.parts, new Set([id])),
            (inherited) => [{ parts: [], started: true }, [...inherited, part]] as const,
          );
        }

        return Effect.succeed([state, part.session === id ? [part] : []] as const);
      },
    ),
  );

/**
 * Streams each session declaration together with the session it is forked from.
 *
 * The scan keeps the session of every part by its identifier, because a `fork`
 * names the part it continues from and that part precedes its declaration.
 */
const edges = <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>>(
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Stream.Stream<Edge, TrajectoryError> =>
  trajectory.pipe(
    Stream.mapAccum(
      () => new Map<string, string | undefined>(),
      (sessionOf, part): readonly [Map<string, string | undefined>, ReadonlyArray<Edge>] => {
        if (!Predicate.isTagged("Session")(part)) {
          sessionOf.set(part.uuid, part.session);

          return [sessionOf, []];
        }

        const source = part.fork === undefined ? undefined : sessionOf.get(part.fork);

        sessionOf.set(part.uuid, part.session);

        if (source === undefined || source === part.session) {
          return [sessionOf, []];
        }

        return [sessionOf, [{ session: part.session, source }]];
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
