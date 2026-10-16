/**
 * The generic services a recording is carried and kept through: the compression
 * its parts are carried in, the hash it is named by, the byte sequence a storage
 * serves it as, and the storage itself.
 *
 * Every module is re-exported as a namespace — `Bytes.Bytes`,
 * `Storage.Storage` — and each is also available as a subpath import such as
 * `@trajs/utils/Bytes`.
 *
 * Where a recording is kept and what reads a digest are stated here over what any
 * platform provides — `Storage.layerFileSystem` and `StreamHash.layer` — and what
 * carries a recording's parts in a frame is a platform package's to state, which is
 * what `@trajs/platform-node`, `@trajs/platform-bun` and `@trajs/platform-browser`
 * provide.
 */

export * as Bytes from "#/Bytes.ts";

export * as Compression from "#/Compression.ts";

export * as Storage from "#/Storage.ts";

export * as StreamHash from "#/StreamHash.ts";
