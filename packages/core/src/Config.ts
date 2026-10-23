import * as EventKit from "#/EventKit.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Toolkit from "#/Toolkit.ts";

/**
 * The kits for trajectory parts and the flag permitting streaming response parts.
 *
 * **Details**
 *
 * - `toolkit` supplies schemas for tool calls and results through {@link Toolkit.Toolkit}.
 * - `eventkit` declares application events through {@link EventKit.Eventkit}.
 * - `metrickit` supplies schemas for metric outputs and producer failures through {@link MetricKit.Kit}.
 * - `extrakit` declares prompt, response, and session extra data through {@link ExtraKit.Kit}.
 * - `stream: true` permits both streaming and non-streaming response parts.
 * - `stream: false` permits only non-streaming response parts.
 *
 * The `stream` flag selects response parts; it does not control when the trajectory is consumed.
 *
 * @see {@link config} for defaults
 * @category models
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
 * A {@link Config} accepting either `stream` setting and any kits.
 *
 * Use a concrete {@link Config} to retain the types declared by its kits.
 *
 * @category models
 */
export type AnyConfig = Config<boolean, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * A {@link Config} restricted to non-streaming response parts, with any kits.
 *
 * The trajectory remains a stream and may emit parts over time.
 *
 * @category models
 */
export type NonStreamConfig = Config<false, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * A {@link Config} with empty kits, permitting streaming and non-streaming response parts.
 *
 * Empty kits declare no events, metrics, or extra data.
 * Tool call parameters and tool results are typed as `unknown`.
 * Decoding event and metric parts requires kits declaring those events and metrics.
 *
 * @see {@link config} for supplying kits
 * @category models
 */
export type UnknownConfig = Config<
  true,
  Toolkit.Empty,
  EventKit.Empty,
  MetricKit.Empty,
  ExtraKit.Empty
>;

/**
 * The default configuration for decoding parts without caller-supplied kits.
 *
 * It permits streaming and non-streaming response parts and supplies empty kits.
 * Its {@link Config} annotation does not retain the precise empty-kit types.
 *
 * @see {@link config} for a configuration retaining the types of its kits
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
 * Creates a configuration with defaults for omitted kits and the `stream` flag.
 *
 * **Details**
 *
 * `stream` defaults to `true`, and omitted kits default to empty kits.
 * Use `stream: false` when consumers require non-streaming response parts.
 * Creating a configuration does not transform a stream or decode any parts.
 *
 * @see {@link anyConfig} for the default configuration without specific kit types
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
 * The {@link Config} of two merged trajectories.
 *
 * Kits combine their declarations, with right-hand definitions winning on duplicate names or tags.
 * The result permits streaming response parts if either input permits them.
 * Merging kits does not convert existing parts to the merged schemas.
 *
 * @category models
 */
export type MergedConfig<Left extends AnyConfig, Right extends AnyConfig> = Config<
  Left["stream"] | Right["stream"],
  Toolkit.Toolkit<Toolkit.MergedTools<readonly [Left["toolkit"], Right["toolkit"]]>>,
  EventKit.Merged<readonly [Left["eventkit"], Right["eventkit"]]>,
  MetricKit.Merged<readonly [Left["metrickit"], Right["metrickit"]]>,
  ExtraKit.Merged<readonly [Left["extrakit"], Right["extrakit"]]>
>;

/**
 * The tools a {@link Config} states, keyed by name.
 *
 * **When to use**
 *
 * Use to type a tool call or a tool result read from a trajectory rather than from one of its kits.
 *
 * @see {@link EventsOf} for the events the same configuration declares
 * @category models
 */
export type ToolsOf<C extends AnyConfig> = C["toolkit"]["tools"];

/**
 * The events a {@link Config} states, keyed by tag.
 *
 * @see {@link ToolsOf} for the tools the same configuration declares
 * @category models
 */
export type EventsOf<C extends AnyConfig> = C["eventkit"]["events"];

/**
 * The metrics a {@link Config} states, keyed by tag.
 *
 * @see {@link ToolsOf} for the tools the same configuration declares
 * @category models
 */
export type MetricsOf<C extends AnyConfig> = C["metrickit"]["metrics"];

/**
 * The extra data a {@link Config} states, keyed by tag.
 *
 * @see {@link ToolsOf} for the tools the same configuration declares
 * @category models
 */
export type ExtrasOf<C extends AnyConfig> = C["extrakit"]["extra"];
