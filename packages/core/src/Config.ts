/**
 * Kits for reading trajectory parts.
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
 * The kits of one trajectory.
 *
 * **Details**
 *
 * The kits declare tools, events, metrics, and extras for decoding.
 *
 * @see {@link config} for defaulted construction.
 * @stability stable
 * @category configuration
 */
export interface Config<
  Toolkit extends Toolkit.Any = never,
  Events extends EventKit.Any = never,
  Metrics extends MetricKit.Any = never,
  Extras extends ExtraKit.Any = never,
> {
  toolkit: Toolkit;
  eventkit: Events;
  metrickit: Metrics;
  extrakit: Extras;
}

/**
 * A {@link Config} without specific kit types.
 *
 * @stability stable
 * @category utility types
 */
export type AnyConfig = Config<Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * A default config with widened kit types.
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
 * Each omitted kit defaults to its empty kit.
 * Supplied kits keep their specific types.
 *
 * @see {@link Config} for the resulting configuration.
 * @stability stable
 * @category constructors
 */
export const config = <
  const Toolkit extends Toolkit.Any = Toolkit.Empty,
  Events extends EventKit.Any = EventKit.Empty,
  Metrics extends MetricKit.Any = MetricKit.Empty,
  Extras extends ExtraKit.Any = ExtraKit.Empty,
>(
  config: Partial<Config<Toolkit, Events, Metrics, Extras>> = {},
): Config<Toolkit, Events, Metrics, Extras> =>
  // SAFETY: omitted fields use the defaults mirrored by the default type arguments.
  ({
    toolkit: config.toolkit ?? Toolkit.empty,
    eventkit: config.eventkit ?? EventKit.empty,
    metrickit: config.metrickit ?? MetricKit.empty,
    extrakit: config.extrakit ?? ExtraKit.empty,
  }) as Config<Toolkit, Events, Metrics, Extras>;

/**
 * The combined kits of two configs.
 *
 * **Details**
 *
 * Event, metric, and extra declarations from `Right` replace matching declarations from `Left`.
 * Tool declarations with matching keys retain the union of both types.
 *
 * **Gotchas**
 *
 * This type does not merge config values at runtime.
 *
 * @stability stable
 * @category utility types
 */
export type MergedConfig<Left extends AnyConfig, Right extends AnyConfig> = Config<
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
