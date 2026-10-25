/**
 * An ATIF document read as a trajectory.
 *
 * {@link encode} reads a {@link Document.Document} as the `@trajs/core` trajectory it
 * states, and {@link fromFile} does the same for the `trajectory.json` a path names.
 */

import { EventKit, MetricKit, Produce, type Toolkit, Trajectory } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { TrajectoryError } from "@trajs/core/TrajectoryError";
import { Effect, FileSystem, Path, Schema } from "effect";
import type { PlatformError } from "effect";

import { produce } from "#/internal/reading.ts";
import { toolkitOf } from "#/internal/toolkit.ts";

import { FromJson } from "./Document.ts";
import type { Document } from "./Document.ts";
import { extrakit } from "./Extras.ts";

/**
 * What a document is read with beside the document itself.
 *
 * `cwd` is the directory the paths a document states are read from; an absolute path is
 * read as stated either way.
 *
 * @category models
 */
export interface Options {
  /** Where the paths a document states are read from, relative paths among them. */
  readonly cwd?: string;
}

/**
 * Reads an ATIF document as the trajectory it states.
 *
 * A step that states a message opens a turn with it, and an agent step is produced as
 * the parts of the response it answered with. What the document states of a step and of
 * the run is carried as extra data on the part it belongs to, and the media a step
 * states is read from the path it names.
 *
 * What a trajectory holds no part for is not read: delegations and continuations,
 * copied steps, what a system step is answered with, and context management.
 *
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
 * Reads the ATIF document a file holds, as the trajectory it states.
 *
 * The document is decoded with {@link Document.FromJson} and read beside it, as
 * {@link encode} reads one.
 *
 * @category constructors
 */
export const fromFile = (
  path: string,
): Effect.Effect<
  Trajectory.Trajectory<
    string,
    Config.Config<true, Toolkit.Any, EventKit.Empty, MetricKit.Empty, typeof extrakit>,
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
 * the extra data this package carries.
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
      // The extra data of this package, so what a document states of a run and of its
      // steps reads back as the fields they are rather than as the JSON they were written
      // as.
      extrakit,
    }),
  );
