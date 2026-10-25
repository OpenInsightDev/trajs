/**
 * The storage of a file system: one trajectory per file, named by its path, as
 * `Storage.layerFileSystem` provides it.
 */

import { Effect, FileSystem, Sink } from "effect";

import { type Byte, makeByte } from "#/Byte.ts";
import { type Storage, StorageError } from "#/Storage.ts";

const fileBytes = (fs: FileSystem.FileSystem, path: string): Byte<StorageError> =>
  makeByte({
    length: fs.stat(path).pipe(
      Effect.map((info) => info.size),
      Effect.mapError((cause) => new StorageError({ id: path, cause })),
    ),
    read: (buffer, { offset = 0n } = {}) =>
      Effect.gen(function* () {
        const file = yield* fs.open(path, { flag: "r" });

        if (offset !== 0n) {
          yield* file.seek(offset, "start");
        }

        return yield* file.read(buffer);
      }).pipe(
        Effect.scoped,
        Effect.mapError((cause) => new StorageError({ id: path, cause })),
      ),
  });

export const fileSystemStorage = (fs: FileSystem.FileSystem): Storage => ({
  read: (id) => Effect.succeed(fileBytes(fs, id)),
  write: (id, options) =>
    fs
      .sink(id, { flag: options?.overwrite === false ? "wx" : "w" })
      .pipe(Sink.mapError((cause) => new StorageError({ id, cause }))),
});
