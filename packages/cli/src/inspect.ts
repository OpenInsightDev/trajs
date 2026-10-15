/**
 * The `trajs inspect` command: the header a `.trajs` file states about itself,
 * printed as JSON.
 *
 * A recording carries its header as the first line of the file, and nothing
 * before that line is compressed, so reading it does not read the trajectory:
 * the exchange's own header sink reads the line and stops. What is printed is
 * the header as the format encodes it, so the output is the recording's own
 * statement of what it was written with rather than a re-description of it.
 */

import { Exchange, Header, nodeLayer } from "@trajs/core/Exchange";
import { Console, Effect, FileSystem, Schema, Stream } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";

const json = (header: Header, indent: number): string =>
  JSON.stringify(Schema.encodeSync(Header)(header), null, indent);

/**
 * The `inspect` command: reads a recording's header and prints it.
 */
export const inspect = Command.make(
  "inspect",
  {
    file: Argument.File("file-path", { mustExist: true }).pipe(
      Argument.withDescription("The `.trajs` file whose header is read."),
    ),
    indent: Flag.Int("indent").pipe(
      Flag.withDescription(
        "Spaces to indent the header's JSON by. Without it the header is written on one line.",
      ),
      Flag.withDefault(0),
    ),
  },
  ({ file, indent }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const exchange = yield* Exchange;

      const header = yield* Stream.run(fs.stream(file), exchange.metadata);

      yield* Console.log(json(header, indent));
    }).pipe(
      // A file that cannot be read, or one whose first line is not a header, is
      // what the person who ran the command can act on, so it is reported as the
      // message it already carries rather than as a stack trace.
      Effect.mapError((cause) => new CliError.UserError({ cause })),
    ),
).pipe(
  Command.withDescription("Print the header of a `.trajs` file."),
  // The header is read with the format this package ships, over `node:zlib`;
  // the frame the parts are carried in is never reached, so nothing past the
  // header line is decompressed.
  Command.provide(nodeLayer),
);
