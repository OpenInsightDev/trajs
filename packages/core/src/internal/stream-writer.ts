import { Context, Effect, FileSystem, Formatter, Layer, Schema, Stream } from "effect";
import type { OpenFlag } from "effect/FileSystem";

export class WriteFailed extends Schema.TaggedError<WriteFailed>(
  "open-insight/utils/StreamWriterError/WriteFailed",
)("WriteFailed", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Failed to write stream: ${Formatter.format(this.cause)}`;
  }
}

export interface Service {
  readonly write: <E, R>(
    key: string,
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Effect.Effect<void, E | WriteFailed, R>;
}

export class StreamWriter extends Context.Service<StreamWriter, Service>()(
  "open-insight/utils/StreamWriter",
) {
  /**
   * Writes the bytes of a stream to a key, wrapping a failure to write them in
   * {@link WriteFailed} and keeping a failure to read them as it is.
   */
  static readonly layerFromOptions = (
    options: Readonly<{
      readonly flag?: OpenFlag;
      readonly mode?: number;
    }>,
  ): Layer.Layer<StreamWriter, never, FileSystem.FileSystem> =>
    Layer.effect(
      StreamWriter,
      Effect.map(FileSystem.FileSystem, (fs): Service => ({
        write: (key, bytes) =>
          bytes.pipe(
            Stream.run(fs.sink(key, options)),
            Effect.catchTag("PlatformError", (cause) => Effect.fail(new WriteFailed({ cause }))),
          ),
      })),
    );

  static readonly layer: Layer.Layer<StreamWriter, never, FileSystem.FileSystem> =
    this.layerFromOptions({});
}
