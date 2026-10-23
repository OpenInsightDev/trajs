import { Algorithm as CompressionAlgorithm, Compression } from "@trajs/utils/Compression";
import { Storage, type StorageError } from "@trajs/utils/Storage";
import { Algorithm as HashAlgorithm, StreamHash } from "@trajs/utils/StreamHash";
import { Context, Effect, Layer, Schema } from "effect";

import * as Config from "#/Config.ts";
import { Contribution, service } from "#/internal/exchange.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

import pkg from "../package.json" with { type: "json" };

export const Magic = new TextEncoder().encode("TRAJS");

export const Version = pkg.version;

export const Header = Schema.Struct({
  toolkit: Schema.JsonObject,
  eventkit: Schema.Record(Schema.String, Contribution),
  metrickit: Schema.Record(Schema.String, Contribution),
  extrakit: Schema.Record(Schema.String, Contribution),
});

export type Header = Schema.Schema.Type<typeof Header>;

export const Metadata = Schema.Struct({
  version: Schema.String,
  compression: CompressionAlgorithm,
  hash: HashAlgorithm,
  digest: Schema.String,
});

export type Metadata = Schema.Schema.Type<typeof Metadata>;

export type EncodingServices<C extends Config.AnyConfig> = Encoding<C>;

export interface Loaded {
  readonly header: Header;

  readonly metadata: Metadata;

  readonly read: <C extends Config.AnyConfig = Config.AnyConfig>(
    config?: C & Readable<C>,
  ) => Trajectory.Trajectory<string, C, TrajectoryError | StorageError, never>;
}

export interface Service {
  readonly load: (id: string) => Effect.Effect<Loaded, TrajectoryError | StorageError>;

  readonly save: <C extends Config.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<string, C, E, R>,
  ) => (
    id: string,
  ) => Effect.Effect<void, E | TrajectoryError | StorageError, R | EncodingServices<C>>;
}

export class Exchange extends Context.Service<Exchange, Service>()("trajs/core/Exchange") {
  static readonly layer: Layer.Layer<Exchange, never, Storage | Compression | StreamHash> =
    Layer.effect(
      Exchange,
      Effect.gen(function* () {
        const storage = yield* Storage;
        const compression = yield* Compression;
        const hasher = yield* StreamHash;

        return service(Header, Metadata, storage, compression, hasher);
      }),
    );
}

export const Part = <C extends Config.AnyConfig>(config: C): Schema.Union<PartMembers<C>> =>
  part(config);
