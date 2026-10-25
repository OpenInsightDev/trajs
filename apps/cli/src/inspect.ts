/**
 * The `trajs inspect` command: what a `.trajs` file states about itself — its
 * header, or with `--metadata` what it states at its end about its own bytes —
 * printed as JSON.
 *
 * A trajectory carries its header at the head of the file and its metadata at its
 * tail, and neither is compressed. `Exchange.inspect` reads them and stops before
 * the frame the parts are carried in.
 *
 * What is printed is what the file states — the header as the format encodes it, and
 * the metadata with the algorithm each of its two coded fields states named rather
 * than coded ({@link metadataJson}).
 */

import * as Exchange from "@trajs/core/Exchange";
import { NodeServices } from "@trajs/platform-node";
import { Algorithm as CompressionAlgorithm } from "@trajs/utils/Compression";
import { layerFileSystem } from "@trajs/utils/Storage";
import { Algorithm as HashAlgorithm } from "@trajs/utils/StreamHash";
import { Console, Effect, Layer, Schema } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";

/** What the format encodes a trajectory's header to, printed as JSON at `indent`. */
const headerJson = (header: Exchange.Header, indent: number): string =>
  JSON.stringify(Schema.encodeSync(Exchange.Header)(header), null, indent);

/**
 * The names each compression algorithm goes by, keyed by the code the format carries
 * it as.
 */
const compressions = new Map<number, string>(
  Object.entries(CompressionAlgorithm.enums).map(([name, code]) => [code, name] as const),
);

/** The names each hash algorithm goes by, keyed by the code the format carries it as. */
const hashes = new Map<number, string>(
  Object.entries(HashAlgorithm.enums).map(([name, code]) => [code, name] as const),
);

/**
 * The name an algorithm goes by, as the code the format carries it as.
 *
 * A trajectory states an algorithm as the code it goes by rather than as the name of
 * it ({@link Metadata}), since the codes are the format's and a code is never
 * restated for another algorithm. A reader of what the command prints is after the
 * name, so the codes the vocabularies state are read back to theirs; a code that
 * states no name is printed as itself, since it is still what the file carries.
 */
const nameOf = (names: ReadonlyMap<number, string>, code: number): string =>
  names.get(code) ?? String(code);

/**
 * What the format encodes a trajectory's metadata to, printed as JSON at `indent`,
 * with the algorithm each of its two coded fields states named rather than coded.
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
 * The `inspect` command: reads what a trajectory states and prints it.
 */
export const inspect = Command.make(
  "inspect",
  {
    file: Argument.File("file-path", { mustExist: true }).pipe(
      Argument.withDescription("The `.trajs` file whose header or metadata is read."),
    ),
    indent: Flag.Int("indent").pipe(
      Flag.withDescription(
        "Spaces to indent the printed JSON by. Without it it is written on one line.",
      ),
      Flag.withDefault(0),
    ),
    metadata: Flag.Boolean("metadata").pipe(
      Flag.withDescription(
        "Print what the trajectory states at its end instead of at its head: how its parts were written and what they digest to, with each algorithm named rather than coded.",
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
      // A file that cannot be read, or one whose bytes do not state what was asked
      // for — a header at its head, a metadata at its tail — is what the person who
      // ran the command can act on, so it is reported as the message it already
      // carries rather than as a stack trace.
      Effect.mapError((cause) => new CliError.UserError({ cause })),
    ),
).pipe(
  Command.withDescription("Print what a `.trajs` file states about itself."),
  // The frame the parts are carried in is never decompressed, since what is printed
  // is what the file states rather than anything read out of the parts.
  Command.provide(
    Layer.provide(Exchange.layer, Layer.merge(NodeServices.layer(), layerFileSystem)),
  ),
);
