/**
 * The `trajs inspect` command.
 *
 * It prints the header or the metadata of a `.trajs` file as JSON.
 * The format carries the header at the head of the file and the metadata at its tail.
 * Neither record is compressed, so {@link Exchange.Service.inspect} reads both
 * without parsing the part frame.
 */

import * as Exchange from "@trajs/core/Exchange";
import { NodeServices } from "@trajs/platform-node";
import { Algorithm as CompressionAlgorithm } from "@trajs/utils/Compression";
import { layerFileSystem } from "@trajs/utils/Storage";
import { Algorithm as HashAlgorithm } from "@trajs/utils/StreamHash";
import { Console, Effect, Layer, Schema } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";

/** Returns the header in the encoding of the format, as JSON at `indent`. */
const headerJson = (header: Exchange.Header, indent: number): string =>
  JSON.stringify(Schema.encodeSync(Exchange.Header)(header), null, indent);

/** The name of each compression algorithm, keyed by its code in the format. */
const compressions = new Map<number, string>(
  Object.entries(CompressionAlgorithm.enums).map(([name, code]) => [code, name] as const),
);

/** The name of each hash algorithm, keyed by its code in the format. */
const hashes = new Map<number, string>(
  Object.entries(HashAlgorithm.enums).map(([name, code]) => [code, name] as const),
);

/**
 * Returns the name the vocabulary gives `code`.
 *
 * A code from another format version is returned as itself.
 */
const nameOf = (names: ReadonlyMap<number, string>, code: number): string =>
  names.get(code) ?? String(code);

/**
 * Returns the metadata in the encoding of the format, as JSON at `indent`, with
 * `compression` and `hash` named rather than coded.
 */
const metadataJson = (metadata: Exchange.Metadata, indent: number): string => {
  const stated = Schema.encodeSync(Exchange.Metadata)(metadata);

  return JSON.stringify(
    {
      ...stated,
      compression: nameOf(compressions, stated.compression),
      hash: nameOf(hashes, stated.hash),
    },
    null,
    indent,
  );
};

/**
 * The `inspect` subcommand, registered by the root `trajs` command.
 */
export const inspect = Command.make(
  "inspect",
  {
    file: Argument.File("file-path", { mustExist: true }).pipe(
      Argument.withDescription("The `.trajs` file whose header or metadata is read."),
    ),
    indent: Flag.Int("indent").pipe(
      Flag.withDescription(
        "Spaces to indent the printed JSON by. Without it the JSON is written on one line.",
      ),
      Flag.withDefault(0),
    ),
    metadata: Flag.Boolean("metadata").pipe(
      Flag.withDescription(
        "Print the metadata instead of the header. It states how the parts were compressed and hashed, and their digest, with both algorithms named.",
      ),
      Flag.withDefault(false),
    ),
  },
  ({ file, indent, metadata }) =>
    Effect.gen(function* () {
      const exchange = yield* Exchange.Exchange;

      const inspected = yield* exchange.inspect(file);

      const stated = metadata
        ? metadataJson(inspected.metadata, indent)
        : headerJson(inspected.header, indent);

      yield* Console.log(stated);
    }).pipe(
      // A file that cannot be read, or that states no header or metadata, is a user error.
      // It is reported as its message rather than as a stack trace.
      Effect.mapError((cause) => new CliError.UserError({ cause })),
    ),
).pipe(
  Command.withDescription("Print what a `.trajs` file states about itself."),
  // `Exchange.layer` requires compression and hashing, though inspection uses neither.
  Command.provide(Layer.provide(Exchange.layer, Layer.merge(NodeServices.layer, layerFileSystem))),
);
