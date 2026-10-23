import { Algorithm as CompressionAlgorithm, Compression } from "@trajs/utils/Compression";
import { Storage, type StorageError } from "@trajs/utils/Storage";
import { Algorithm as HashAlgorithm, StreamHash } from "@trajs/utils/StreamHash";
import { Context, Effect, Fiber, Layer, Schema, Stream } from "effect";

import * as Config from "#/Config.ts";
import {
  configOf,
  encodeHeader,
  encodePart,
  encodeTrailing,
  framed,
  framesOf,
  headerOf,
  lengthPrefixed,
  reading,
  trailingOf,
} from "#/internal/exchange.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

import pkg from "../package.json" with { type: "json" };

export const Magic = new TextEncoder().encode("TRAJS");

export const Version = pkg.version;

export const Header = Schema.Struct({
  toolkit: Schema.JsonObject,
  eventkit: Schema.Record(Schema.String, Schema.Json),
  metrickit: Schema.Record(Schema.String, Schema.Json),
  extrakit: Schema.Record(Schema.String, Schema.Json),
});

export type Header = Schema.Schema.Type<typeof Header>;

export const Metadata = Schema.Struct({
  version: Schema.String,
  compression: CompressionAlgorithm,
  hash: HashAlgorithm,
  digest: Schema.String,
});

export type Metadata = Schema.Schema.Type<typeof Metadata>;

export interface Loaded {
  readonly header: Header;

  readonly metadata: Metadata;

  readonly read: <C extends Config.AnyConfig = Config.AnyConfig>(
    config?: C,
  ) => Trajectory.Trajectory<string, C, TrajectoryError | StorageError, never>;
}

export interface Service {
  readonly load: <Config extends Config.AnyConfig>(
    config: Config,
  ) => (
    id: string,
  ) => Effect.Effect<Loaded, TrajectoryError | StorageError, Config.EncodingServices<Config>>;

  readonly save: <Config extends Config.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<string, Config, E, R>,
  ) => (
    id: string,
  ) => Effect.Effect<void, E | TrajectoryError | StorageError, R | Config.EncodingServices<Config>>;
}

const asConfig = <C extends Config.AnyConfig>(config: Config.AnyConfig): C =>
  // SAFETY: every config is read as the config it already is.
  config as C;

export class Exchange extends Context.Service<Exchange, Service>()("trajs/core/Exchange") {
  static readonly layer: Layer.Layer<Exchange, never, Storage | Compression | StreamHash> =
    Layer.effect(
      Exchange,
      Effect.gen(function* () {
        const storage = yield* Storage;
        const compression = yield* Compression;
        const hasher = yield* StreamHash;

        return {
          load:
            <Config extends Config.AnyConfig>(config: Config) =>
            (id: string) =>
              Effect.gen(function* () {
                const bytes = yield* storage.read(id);
                const stated = yield* headerOf(Header, bytes);
                const trailing = yield* trailingOf(Metadata, Magic, bytes);

                const frame = framed(
                  framesOf<StorageError>({ from: stated.end, to: trailing.end })(bytes).pipe(
                    compression.decompress,
                  ),
                );

                return {
                  header: stated.header,
                  metadata: trailing.metadata,
                  read: <C extends Config.AnyConfig = Config.AnyConfig>(given?: C) =>
                    reading(frame, given ?? asConfig<C>(config)),
                };
              }),
          save:
            <Config extends Config.AnyConfig, E, R>(
              trajectory: Trajectory.Trajectory<string, Config, E, R>,
            ) =>
            (id: string) => {
              const config = configOf(trajectory);

              const encoded = Effect.gen(function* () {
                const header = new TextEncoder().encode(encodeHeader(config));

                const frames = trajectory.pipe(
                  Stream.mapEffect(encodePart(config), { concurrency: 1 }),
                );

                const [written, hashed] = yield* Stream.broadcastN(frames, {
                  n: 2,
                  capacity: "unbounded",
                });

                const digest = yield* Stream.run(hashed, hasher.digest).pipe(Effect.forkScoped);

                const trailing = Fiber.join(digest).pipe(
                  Effect.map((digest) =>
                    encodeTrailing(Metadata, Magic, {
                      version: Version,
                      compression: compression.algorithm,
                      hash: hasher.algorithm,
                      digest,
                    }),
                  ),
                  Stream.fromEffect,
                );

                const body = framed(written.pipe(compression.compress));

                return Stream.make(lengthPrefixed(header)).pipe(
                  Stream.concat(body),
                  Stream.concat(trailing),
                );
              }).pipe(Stream.unwrap, Stream.scoped);

              // SAFETY: the scope is provided by the save itself, and the encoding services are those the config states.
              return Stream.run(encoded, storage.write(id)).pipe(Effect.scoped) as Effect.Effect<
                void,
                E | TrajectoryError | StorageError,
                R | Config.EncodingServices<Config>
              >;
            },
        };
      }),
    );
}
