/**
 * The generic services a trajectory is carried and kept through.
 *
 * {@link Compression} writes and reads the frame of a trajectory's parts.
 * {@link StreamHash} reads the digest a trajectory is named by.
 * {@link Checksum} checks a block of those parts.
 * {@link Byte} is the bytes of a trajectory, read at random.
 * {@link Storage} is where a program keeps its trajectories.
 * {@link ByteStore} keeps bytes between readings.
 * {@link BinaryProtocol} reads and writes the bytes of one message of a binary
 * protocol, and is not stable yet.
 *
 * A module is also a subpath import, such as `@trajs/utils/Byte`.
 * The layers stated here work over any platform, such as {@link Storage.layerFileSystem} and
 * {@link Storage.layerS3}.
 * A platform package states the codec a frame is carried with, such as `@trajs/platform-node`.
 * The bytes kept between readings are kept over the key/value store of `effect/persistence`
 * ({@link ByteStore.layerKVStore}), over the one in memory ({@link ByteStore.layer}), or in a
 * bucket ({@link ByteStore.layerS3}).
 *
 * @stability stable
 */

export * as BinaryProtocol from "#/BinaryProtocol.ts";

export * as Byte from "#/Byte.ts";

export * as ByteStore from "#/ByteStore.ts";

export * as Checksum from "#/Checksum.ts";

export * as Compression from "#/Compression.ts";

export * as Storage from "#/Storage.ts";

export * as StreamHash from "#/StreamHash.ts";
