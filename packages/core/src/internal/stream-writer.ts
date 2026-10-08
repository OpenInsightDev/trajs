import { Context, Effect, FileSystem, Formatter, Layer, Schema, Stream } from "effect";
import { Ndjson } from "effect/encoding";
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
  readonly write: <S extends Schema.Constraint>(
    schema: S,
  ) => <E, R>(
    key: string,
    values: Stream.Stream<S["Type"], E, R>,
  ) => Effect.Effect<void, E | WriteFailed, R | S["EncodingServices"]>;
}

export class StreamWriter extends Context.Service<StreamWriter, Service>()(
  "open-insight/utils/StreamWriter",
) {
  /** Writes records as newline-delimited JSON, one record per line. */
  static readonly layerFromOptions = (
    options: Readonly<{
      readonly flag?: OpenFlag;
      readonly mode?: number;
    }>,
  ): Layer.Layer<StreamWriter, never, FileSystem.FileSystem> =>
    Layer.effect(
      StreamWriter,
      Effect.map(FileSystem.FileSystem, (fs): Service => ({
        write: (schema) => {
          const encoder = Ndjson.encodeSchema(schema);

          return (key, values) =>
            values.pipe(
              Stream.pipeThroughChannel(encoder()),
              Stream.run(fs.sink(key, options)),
              Effect.mapError((cause) => new WriteFailed({ cause })),
            );
        },
      })),
    );

  static readonly layer: Layer.Layer<StreamWriter, never, FileSystem.FileSystem> =
    this.layerFromOptions({});
}
