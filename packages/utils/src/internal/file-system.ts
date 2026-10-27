/**
 * The storage of a file system: one trajectory per file, named by its path, as
 * `Storage.layerFileSystem` provides it.
 */

import { Effect, FileSystem, Sink } from "effect";

import { type Byte, makeByte } from "#/Byte.ts";
import { type Storage, StorageError } from "#/Storage.ts";

/**
 * The storage of a file system, over the service it is built from.
 *
 * The file system is read once, where the storage is built, and what reads and
 * writes a trajectory below closes over it.
 */
export const fileSystemStorage: Effect.Effect<Storage, never, FileSystem.FileSystem> = Effect.gen(
  function* () {
    const fs = yield* FileSystem.FileSystem;

    /**
     * A read opens the file, takes what it was asked for and closes it again, so
     * what it serves holds no file open.
     */
    const fileBytes = (id: string): Byte<StorageError> =>
      makeByte({
        length: fs.stat(id).pipe(
          Effect.map((info) => info.size),
          Effect.mapError((cause) => new StorageError({ id, cause })),
        ),
        read: (buffer, { offset = 0n } = {}) =>
          Effect.gen(function* () {
            const file = yield* fs.open(id, { flag: "r" });

            if (offset !== 0n) {
              yield* file.seek(offset, "start");
            }

            return yield* file.read(buffer);
          }).pipe(
            Effect.scoped,
            Effect.mapError((cause) => new StorageError({ id, cause })),
          ),
      });

    /**
     * The sink a write continues a file through: the file is opened, cut at
     * `offset`, and written from there.
     *
     * The cut leaves the bytes before the offset and drops the rest, so what the
     * sink writes replaces the tail of the file rather than following it. An offset
     * past the end of the file is not a cut, so the write fails rather than leaving
     * a gap of zero bytes. Nothing of a file system keeps a second writer out, so
     * the write is the file's only one.
     */
    const resuming = (
      id: string,
      offset: bigint,
    ): Sink.Sink<void, Uint8Array, never, StorageError> =>
      Effect.gen(function* () {
        const { size } = yield* fs.stat(id);

        if (size < offset) {
          return yield* Effect.fail(`it holds ${size} bytes, short of the offset ${offset}`);
        }

        const file = yield* fs.open(id, { flag: "r+" });

        yield* file.truncate(Number(offset));

        // The cut leaves the cursor where it was, so it is moved to the end of what
        // the file keeps before the bytes arrive.
        yield* file.seek(offset, "start");

        return Sink.forEach((chunk: Uint8Array) => file.writeAll(chunk)).pipe(
          Sink.mapError((cause) => new StorageError({ id, cause })),
        );
      }).pipe(
        Effect.mapError((cause) => new StorageError({ id, cause })),
        Sink.unwrap,
      );

    return {
      capabilities: { resume: true },
      read: (id) => Effect.succeed(fileBytes(id)),
      write: (id, options) =>
        options?.mode === "resume"
          ? resuming(id, options.offset ?? 0n)
          : fs
              .sink(id, { flag: options?.overwrite === false ? "wx" : "w" })
              .pipe(Sink.mapError((cause) => new StorageError({ id, cause }))),
    };
  },
);
