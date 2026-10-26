/**
 * Kits and response variants for reading trajectory parts.
 *
 * {@link config} supplies defaults for omitted fields.
 * The service types describe schema requirements for storage operations.
 *
 * @stability stable
 */

import type { Schema } from "effect";
import { Tool } from "effect/ai";

import * as EventKit from "#/EventKit.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Toolkit from "#/Toolkit.ts";

/**
 * The response variant and kits of one trajectory.
 *
 * **Details**
 *
 * `stream` selects streaming increments or finished response parts.
 * The kits declare tools, events, metrics, and extras for decoding.
 *
 * @see {@link config} for defaulted construction.
 * @stability stable
 * @category configuration
 */
export interface Config<
  Stream extends boolean = never,
  Toolkit extends Toolkit.Any = never,
  Events extends EventKit.Any = never,
  Metrics extends MetricKit.Any = never,
  Extras extends ExtraKit.Any = never,
> {
  stream: Stream;
  toolkit: Toolkit;
  eventkit: Events;
  metrickit: Metrics;
  extrakit: Extras;
}

/**
 * A {@link Config} without specific kit or response types.
 *
 * @stability stable
 * @category utility types
 */
export type AnyConfig = Config<boolean, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * A {@link Config} for finished response parts.
 *
 * @see {@link Config} for the streaming variant.
 * @stability stable
 * @category configuration
 */
export type NonStreamConfig = Config<false, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * A streaming {@link Config} with no declared tools, events, metrics, or extras.
 *
 * @see {@link config} for constructing this default.
 * @stability stable
 * @category configuration
 */
export type UnknownConfig = Config<
  true,
  Toolkit.Empty,
  EventKit.Empty,
  MetricKit.Empty,
  ExtraKit.Empty
>;

/**
 * A default streaming config with widened kit types.
 *
 * **Gotchas**
 *
 * Every kit is empty at runtime.
 * The widened type does not declare schemas for arbitrary events, metrics, or extras.
 *
 * @see {@link config} for retaining specific kit types.
 * @stability stable
 * @category constants
 */
export const anyConfig: AnyConfig = {
  stream: true,
  toolkit: Toolkit.empty,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
};

/**
 * Creates a config with defaults for omitted fields.
 *
 * **Details**
 *
 * `stream` defaults to `true`.
 * Each omitted kit defaults to its empty kit.
 * Supplied kits keep their specific types.
 *
 * @see {@link Config} for the resulting configuration.
 * @stability stable
 * @category constructors
 */
export const config = <
  const Stream extends boolean = true,
  Toolkit extends Toolkit.Any = Toolkit.Empty,
  Events extends EventKit.Any = EventKit.Empty,
  Metrics extends MetricKit.Any = MetricKit.Empty,
  Extras extends ExtraKit.Any = ExtraKit.Empty,
>(
  config: Partial<Config<Stream, Toolkit, Events, Metrics, Extras>> = {},
): Config<Stream, Toolkit, Events, Metrics, Extras> =>
  // SAFETY: omitted fields use the defaults mirrored by the default type arguments.
  ({
    stream: config.stream ?? true,
    toolkit: config.toolkit ?? Toolkit.empty,
    eventkit: config.eventkit ?? EventKit.empty,
    metrickit: config.metrickit ?? MetricKit.empty,
    extrakit: config.extrakit ?? ExtraKit.empty,
  }) as Config<Stream, Toolkit, Events, Metrics, Extras>;

/**
 * The combined kits and response variants of two configs.
 *
 * **Details**
 *
 * Event, metric, and extra declarations from `Right` replace matching declarations from `Left`.
 * Tool declarations with matching keys retain the union of both types.
 * The response variant is the union of both `stream` types.
 *
 * **Gotchas**
 *
 * This type does not merge config values at runtime.
 *
 * @stability stable
 * @category utility types
 */
export type MergedConfig<Left extends AnyConfig, Right extends AnyConfig> = Config<
  Left["stream"] | Right["stream"],
  Toolkit.Toolkit<Toolkit.MergedTools<readonly [Left["toolkit"], Right["toolkit"]]>>,
  EventKit.Merged<readonly [Left["eventkit"], Right["eventkit"]]>,
  MetricKit.Merged<readonly [Left["metrickit"], Right["metrickit"]]>,
  ExtraKit.Merged<readonly [Left["extrakit"], Right["extrakit"]]>
>;

/**
 * Tool declarations retained by a {@link Config}.
 *
 * @stability stable
 * @category utility types
 */
export type ToolsOf<C extends AnyConfig> = C["toolkit"]["tools"];

/**
 * Event declarations retained by a {@link Config}.
 *
 * @stability stable
 * @category utility types
 */
export type EventsOf<C extends AnyConfig> = C["eventkit"]["events"];

/**
 * Metric declarations retained by a {@link Config}.
 *
 * @stability stable
 * @category utility types
 */
export type MetricsOf<C extends AnyConfig> = C["metrickit"]["metrics"];

/**
 * Extra declarations retained by a {@link Config}.
 *
 * @stability stable
 * @category utility types
 */
export type ExtrasOf<C extends AnyConfig> = C["extrakit"]["extra"];

type ToolOf<C extends AnyConfig> = ToolsOf<C>[keyof ToolsOf<C>];

/**
 * Schema requirements for decoding the tools, events, metrics, and extras of a {@link Config}.
 *
 * @see {@link EncodingServices} for writing the same declarations.
 * @stability stable
 * @category utility types
 */
export type DecodingServices<C extends AnyConfig> =
  | Schema.Codec.DecodingServices<Tool.ParametersSchema<ToolOf<C>>>
  | Tool.ResultDecodingServices<ToolOf<C>>
  | EventKit.DecodingServices<C["eventkit"]>
  | MetricKit.DecodingServices<C["metrickit"]>
  | ExtraKit.DecodingServices<C["extrakit"]>;

/**
 * Schema requirements for encoding the tools, events, metrics, and extras of a {@link Config}.
 *
 * @see {@link DecodingServices} for reading the same declarations.
 * @stability stable
 * @category utility types
 */
export type EncodingServices<C extends AnyConfig> =
  | Tool.ParametersEncodingServices<ToolOf<C>>
  | Tool.ResultEncodingServices<ToolOf<C>>
  | EventKit.EncodingServices<C["eventkit"]>
  | MetricKit.EncodingServices<C["metrickit"]>
  | ExtraKit.EncodingServices<C["extrakit"]>;

/**
 * Schema requirements for both reading and writing the tools, events, metrics, and extras of a
 * {@link Config}.
 *
 * **When to use**
 *
 * Use for the requirement of an operation that both reads and writes parts.
 *
 * **Details**
 *
 * The union keeps an empty side from dropping the other side's requirement.
 *
 * @see {@link DecodingServices} for reading alone.
 * @see {@link EncodingServices} for writing alone.
 * @stability stable
 * @category utility types
 */
export type SchemaServices<C extends AnyConfig> = DecodingServices<C> | EncodingServices<C>;
