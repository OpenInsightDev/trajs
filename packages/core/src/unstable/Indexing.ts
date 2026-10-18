/**
 * Indexing a trajectory: a trajectory read into memory once, so that what it holds
 * is asked of the index rather than read out of the stream it arrived in.
 *
 * A trajectory is one stream of parts in total order — see {@link Trajectory} — so
 * every question about a trajectory that is not about the parts as they arrive is
 * answered by reading the trajectory to its end first. An {@link Index} is that
 * reading: the sink that holds it, which a program yields to obtain.
 */

import { Context, Effect, Effectable, Sink, type Schema } from "effect";

import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The sink an index holds: it reads the parts of a trajectory of the config given
 * to their end, holds what the schema states, fails as a {@link TrajectoryError},
 * and requires the dependencies the index declares.
 */
type SinkOf<
  S extends Schema.Constraint,
  Config extends Trajectory.AnyConfig,
  Dependencies extends ReadonlyArray<Context.Key<any, any>>,
> = Sink.Sink<
  S["Type"],
  Trajectory.Part<Config>,
  never,
  TrajectoryError,
  Context.Service.Identifier<Dependencies[number]>
>;

/**
 * What an {@link Index} is made of: the fields the class states, named once
 * because it states them both as fields and as what its constructor is given.
 */
type Props<
  Pkg extends string,
  Id extends string,
  S extends Schema.Constraint,
  Config extends Trajectory.AnyConfig,
  Dependencies extends ReadonlyArray<Context.Key<any, any>>,
> = {
  readonly package: Pkg;
  readonly id: Id;
  readonly schema: S;
  readonly config: Config;
  readonly dependencies: Dependencies;
  readonly sink: SinkOf<S, Config, Dependencies>;
};

/**
 * An index of a trajectory of the config given: what it holds, the sink that holds
 * it, and what reading a trajectory into it requires.
 *
 * **When to use**
 *
 * Use to state an index of your own or to type one a function takes.
 *
 * **Details**
 *
 * - `package` and `id` name the index — `tag` is `"pkg/id"` — so an index is named
 *   within the package that states it, and two packages may state indexes of the same
 *   id.
 * - `schema` states what the index holds and `sink` is what holds it: one reading of a
 *   trajectory's parts to their end, so nothing of a part is held before the whole
 *   trajectory is. It is a plain schema rather than a
 *   {@link VersionedSchema.VersionedSchema}, since an index is derived from a
 *   trajectory rather than produced.
 * - `config` is what the parts are read with, so an index is of a reading rather than of
 *   a trajectory: an index of {@link Trajectory.anyConfig} reads any trajectory's parts,
 *   whichever kits it was written with.
 * - `dependencies` names the services the sink requires, so what a program must provide
 *   to read a trajectory is stated by the index rather than read off the sink's type.
 *
 * An index is itself an effect: `yield*` gives the sink it holds and requires the
 * dependencies it declares.
 *
 * **Example** (Reading a trajectory into the ids of its sessions)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Sink, Stream } from "effect"
 * import { Extra, Trajectory } from "@trajs/core"
 * import * as Indexing from "@trajs/core/unstable/Indexing"
 *
 * const extrakit = Extra.makeKit()
 *
 * const ids = new Indexing.Index({
 *   package: "trajs/core",
 *   id: "session-ids",
 *   schema: Schema.Array(Schema.String),
 *   config: Trajectory.anyConfig,
 *   dependencies: [],
 *   sink: Sink.reduce<Array<string>, Trajectory.Part<Trajectory.AnyConfig>>(
 *     () => [],
 *     (all, part) => {
 *       if (part._tag === "Session") {
 *         all.push(part.id)
 *       }
 *
 *       return all
 *     }
 *   )
 * })
 *
 * const trajectory = Stream.make(
 *   Trajectory.sessionPart(extrakit)({ id: "asking" }),
 *   Trajectory.sessionPart(extrakit)({ id: "replying" })
 * )
 *
 * const read = Effect.gen(function*() {
 *   return yield* Stream.run(trajectory, yield* ids)
 * })
 *
 * await Effect.runPromise(read) // => ["asking", "replying"]
 * ```
 *
 * @see {@link Trajectory.anyConfig} for the config an index of any trajectory is
 * of.
 * @category models
 */
export class Index<
  Pkg extends string,
  Id extends string,
  S extends Schema.Constraint,
  Config extends Trajectory.AnyConfig,
  Dependencies extends ReadonlyArray<Context.Key<any, any>> = [],
> extends Effectable.Class<
  SinkOf<S, Config, Dependencies>,
  never,
  Context.Service.Identifier<Dependencies[number]>
> {
  readonly package: Pkg;
  readonly id: Id;
  readonly schema: S;
  readonly config: Config;
  readonly dependencies: Dependencies;
  readonly sink: SinkOf<S, Config, Dependencies>;

  constructor(props: Props<Pkg, Id, S, Config, Dependencies>) {
    super();

    this.package = props.package;
    this.id = props.id;
    this.schema = props.schema;
    this.config = props.config;
    this.dependencies = props.dependencies;
    this.sink = props.sink;
  }

  /**
   * The name the index goes by: its id within the package that states it.
   */
  get tag(): `${Pkg}/${Id}` {
    return `${this.package}/${this.id}`;
  }

  /**
   * Yields the sink the index holds, requiring the dependencies it declares.
   */
  asEffect(): Effect.Effect<
    SinkOf<S, Config, Dependencies>,
    never,
    Context.Service.Identifier<Dependencies[number]>
  > {
    return Effect.context<Context.Service.Identifier<Dependencies[number]>>().pipe(
      Effect.as(this.sink),
    );
  }
}
