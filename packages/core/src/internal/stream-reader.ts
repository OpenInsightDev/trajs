import { ByteSize, Context, Effect, FileSystem, Formatter, Layer, Schema, Stream } from "effect";

export class ReadFailed extends Schema.TaggedError<ReadFailed>(
  "open-insight/utils/StreamReaderError/ReadFailed",
)("ReadFailed", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Failed to read stream: ${Formatter.format(this.cause)}`;
  }
}

export interface Service {
  readonly read: (key: string) => Stream.Stream<Uint8Array, ReadFailed>;
}

export class StreamReader extends Context.Service<StreamReader, Service>()(
  "open-insight/utils/StreamReader",
) {
  /**
   * Reads the bytes of a key as a stream, leaving what they hold to the reader of
   * the stream.
   */
  static readonly layerFromOption = (
    options: Readonly<{
      bytesToRead?: ByteSize.Input;
      chunkSize?: number;
      offset?: ByteSize.Input;
    }>,
  ): Layer.Layer<StreamReader, never, FileSystem.FileSystem> =>
    Layer.effect(
      StreamReader,
      Effect.map(FileSystem.FileSystem, (fs): Service => ({
        read: (key) =>
          fs
            .stream(key, options)
            .pipe(
              Stream.catchTag("PlatformError", (cause) => Stream.fail(new ReadFailed({ cause }))),
            ),
      })),
    );

  static readonly layer: Layer.Layer<StreamReader, never, FileSystem.FileSystem> =
    this.layerFromOption({});
}
