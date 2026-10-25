/**
 * ATIF document import into trajectory parts.
 *
 * {@link encode} converts a structured {@link Document}.
 * {@link fromFile} decodes JSON and resolves media paths beside the source file.
 *
 * @stability stable
 */

import { Effect, FileSystem, Path, Schema } from "effect";
import type { PlatformError } from "effect";

import * as Config from "#/Config.ts";
import * as EventKit from "#/EventKit.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Produce from "#/Produce.ts";
import type * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";
import { FromJson } from "#/unstable/atif/Document.ts";
import type { Document } from "#/unstable/atif/Document.ts";
import { extrakit } from "#/unstable/atif/Extra.ts";
import { produce } from "#/unstable/atif/internal/reading.ts";
import { toolkitOf } from "#/unstable/atif/internal/toolkit.ts";

/**
 * Base-directory options for ATIF media files.
 *
 * **Details**
 *
 * `cwd` prefixes relative media paths.
 * Absolute paths remain unchanged.
 * Without `cwd`, paths pass directly to the filesystem service.
 *
 * @see {@link encode} for conversion.
 * @stability stable
 * @category configuration
 */
export interface Options {
  readonly cwd?: string;
}

/**
 * Converts an ATIF document into a lazily produced trajectory.
 *
 * **When to use**
 *
 * Use to import recorded conversation steps and supported metadata into core parts.
 *
 * **Details**
 *
 * The document becomes a child of the main session.
 * Its id uses `session_id`, then `trajectory_id`, then `"atif"`.
 * Agent tool definitions become the trajectory's toolkit.
 * System and user steps become prompts; agent steps become response parts.
 * Run and step metadata are carried as declared extras.
 * Valid step timestamps are attached to the prompt or first response part.
 *
 * **Gotchas**
 *
 * This conversion is not a lossless ATIF round trip.
 * Delegated documents and continuation references are not imported.
 * Copied-context flags do not suppress duplicated steps.
 * System observations and context-management conventions do not become events.
 * Media locations are read through the filesystem, including strings containing URLs.
 * The conversion retains all prepared turns and media before enqueuing their message parts.
 * Invalid timestamps are treated as absent.
 * A document id of `"main"` conflicts with the reserved main session.
 *
 * @see {@link fromFile} for JSON-file import.
 * @see {@link Options} for media path resolution.
 * @stability stable
 * @category constructors
 */
export const encode = (
  document: Document,
  options?: Options,
): Trajectory.Trajectory<
  string,
  Config.Config<
    true,
    Toolkit.Any,
    EventKit.Empty,
    MetricKit.WithProducers<MetricKit.Empty>,
    typeof extrakit
  >,
  TrajectoryError | PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> => kits(document)((main) => produce(main, document, options?.cwd));

/**
 * Reads and decodes an ATIF JSON file before constructing its trajectory.
 *
 * **Details**
 *
 * {@link FromJson} validates the file's JSON text.
 * Relative media paths resolve beside the document file.
 * Media reads and trajectory production remain lazy.
 *
 * **Gotchas**
 *
 * The returned trajectory still requires filesystem and path services when consumed.
 * Document decoding failures become {@link TrajectoryError}; filesystem failures retain their platform error.
 *
 * @see {@link encode} for conversion behavior and unsupported ATIF fields.
 * @stability stable
 * @category constructors
 */
export const fromFile = (
  path: string,
): Effect.Effect<
  Trajectory.Trajectory<
    string,
    Config.Config<
      true,
      Toolkit.Any,
      EventKit.Empty,
      MetricKit.WithProducers<MetricKit.Empty>,
      typeof extrakit
    >,
    TrajectoryError | PlatformError.PlatformError,
    FileSystem.FileSystem | Path.Path
  >,
  TrajectoryError | PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;

    const document = yield* Schema.decodeUnknownEffect(FromJson)(
      yield* fs.readFileString(path),
    ).pipe(Effect.mapError(TrajectoryError.parse));

    return encode(document, { cwd: paths.dirname(path) });
  });

/**
 * The config a document is produced with: the toolkit it says its agent was given, and
 * the extra data this module carries.
 */
const kits = (document: Document) =>
  Produce.produce(
    Config.config({
      stream: true,
      toolkit: toolkitOf(document),
      eventkit: EventKit.empty,
      // A kit that names no metric derives nothing, so the trajectory holds the parts
      // its steps were read as and no metric part.
      metrickit: MetricKit.toProducers(MetricKit.empty, {}),
      // The extra data of this module, so what a document states of a run and of its
      // steps reads back as the fields they are rather than as the JSON they were written
      // as.
      extrakit,
    }),
  );
