/**
 * The compression and the hash of `@trajs/utils`, for a Bun program.
 *
 * {@link layer} provides both for the exchange layer of `@trajs/core`, beside the
 * storage of a trajectory.
 *
 * @stability stable
 */

import * as NodeStreamHash from "@trajs/platform-node/NodeStreamHash";
import type { Compression } from "@trajs/utils/Compression";
import type { StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as BunCompression from "./BunCompression.ts";

/**
 * The compression and the hash of a Bun program.
 *
 * @see {@link layer} for the provider.
 * @stability stable
 * @category models
 */
export type BunServices = Compression | StreamHash;

/**
 * The compression and the hash of a Bun program.
 *
 * **When to use**
 *
 * Use in a Bun program. Provide it beside the storage of a trajectory.
 *
 * **Details**
 *
 * Bun has no BLAKE3 of its own, so the digest comes from
 * `@trajs/platform-node` and the binding `@napi-rs/blake-hash`. Bun loads the
 * binding. The compression is Bun's own ({@link BunCompression.layer}), as
 * `@effect/platform-bun` stands on `@effect/platform-node`.
 *
 * Neither layer states an algorithm, so a call states the one of its write, read
 * or digest.
 *
 * The storage is not among them. File storage comes from `@trajs/utils` beside
 * this layer.
 *
 * @see {@link BunServices} for the provided services.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<BunServices> = Layer.merge(
  BunCompression.layer,
  NodeStreamHash.layer,
);
