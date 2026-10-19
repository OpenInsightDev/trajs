/**
 * The generic services a trajectory is carried and kept through: the compression
 * its parts are carried in, the hash it is named by, the byte sequence a storage
 * serves it as, and the storage itself.
 *
 * Every module is re-exported as a namespace — `Bytes.Bytes`,
 * `Storage.Storage` — and each is also available as a subpath import such as
 * `@trajs/utils/Bytes`.
 *
 * Where a trajectory is kept and what reads a digest are stated here over what any
 * platform provides — `Storage.layerFileSystem` and `StreamHash.layer` — and what
 * carries a trajectory's parts in a frame is a platform package's to state, which is
 * what `@trajs/platform-node`, `@trajs/platform-bun` and `@trajs/platform-browser`
 * provide. Where a trajectory's bytes are kept between readings is stated over the
 * key/value store of `effect/persistence` ({@link ByteStore.layerKVStore}) or over
 * the one in memory ({@link ByteStore.layer}).
 */

export * as Bytes from "#/Bytes.ts";

export * as ByteStore from "#/ByteStore.ts";

export * as Compression from "#/Compression.ts";

export * as Storage from "#/Storage.ts";

export * as StreamHash from "#/StreamHash.ts";
