import { Context, Effect, Effectable, Sink, type Schema } from "effect";

import * as Config from "#/Config.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

type SinkOf<
  S extends Schema.Constraint,
  Config extends Config.AnyConfig,
  Dependencies extends ReadonlyArray<Context.Key<any, any>>,
> = Sink.Sink<
  S["Type"],
  Trajectory.Part<Config>,
  never,
  TrajectoryError,
  Context.Service.Identifier<Dependencies[number]>
>;

type Props<
  Pkg extends string,
  Id extends string,
  S extends Schema.Constraint,
  Config extends Config.AnyConfig,
  Dependencies extends ReadonlyArray<Context.Key<any, any>>,
> = {
  readonly package: Pkg;
  readonly id: Id;
  readonly schema: S;
  readonly config: Config;
  readonly dependencies: Dependencies;
  readonly sink: SinkOf<S, Config, Dependencies>;
};

export class Index<
  Pkg extends string,
  Id extends string,
  S extends Schema.Constraint,
  Config extends Config.AnyConfig,
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

  get tag(): `${Pkg}/${Id}` {
    return `${this.package}/${this.id}`;
  }

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
