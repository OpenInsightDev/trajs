/**
 * The generic services a recording is carried and kept through: the compression
 * its parts are carried in, the hash it is named by, the byte sequence a storage
 * serves it as, and the storage itself.
 *
 * Every module is re-exported as a namespace — `Bytes.Bytes`,
 * `Storage.Storage` — and each is also available as a subpath import such as
 * `@trajs/utils/Bytes`.
 *
 * Nothing here says what any of them is over: what writes and reads a frame, what
 * reads a digest and where a recording is kept are a platform package's to state,
 * and `@trajs/platform-node` and `@trajs/platform-browser` provide the layers these
 * services are read through.
 */

export * as Bytes from "#/Bytes.ts";

export * as Compression from "#/Compression.ts";

export * as Storage from "#/Storage.ts";

export * as StreamHash from "#/StreamHash.ts";
