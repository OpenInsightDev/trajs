import type { Schema } from "effect";
import { Tool } from "effect/ai";

import * as EventKit from "#/EventKit.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Toolkit from "#/Toolkit.ts";

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

export type AnyConfig = Config<boolean, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

export type NonStreamConfig = Config<false, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

export type UnknownConfig = Config<
  true,
  Toolkit.Empty,
  EventKit.Empty,
  MetricKit.Empty,
  ExtraKit.Empty
>;

export const anyConfig: AnyConfig = {
  stream: true,
  toolkit: Toolkit.empty,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
};

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

export type MergedConfig<Left extends AnyConfig, Right extends AnyConfig> = Config<
  Left["stream"] | Right["stream"],
  Toolkit.Toolkit<Toolkit.MergedTools<readonly [Left["toolkit"], Right["toolkit"]]>>,
  EventKit.Merged<readonly [Left["eventkit"], Right["eventkit"]]>,
  MetricKit.Merged<readonly [Left["metrickit"], Right["metrickit"]]>,
  ExtraKit.Merged<readonly [Left["extrakit"], Right["extrakit"]]>
>;

export type ToolsOf<C extends AnyConfig> = C["toolkit"]["tools"];

export type EventsOf<C extends AnyConfig> = C["eventkit"]["events"];

export type MetricsOf<C extends AnyConfig> = C["metrickit"]["metrics"];

export type ExtrasOf<C extends AnyConfig> = C["extrakit"]["extra"];

type ToolOf<C extends AnyConfig> = ToolsOf<C>[keyof ToolsOf<C>];

export type DecodingServices<C extends AnyConfig> =
  | Schema.Codec.DecodingServices<Tool.ParametersSchema<ToolOf<C>>>
  | Tool.ResultDecodingServices<ToolOf<C>>
  | EventKit.DecodingServices<C["eventkit"]>
  | MetricKit.DecodingServices<C["metrickit"]>
  | ExtraKit.DecodingServices<C["extrakit"]>;

export type EncodingServices<C extends AnyConfig> =
  | Tool.ParametersEncodingServices<ToolOf<C>>
  | Tool.ResultEncodingServices<ToolOf<C>>
  | EventKit.EncodingServices<C["eventkit"]>
  | MetricKit.EncodingServices<C["metrickit"]>
  | ExtraKit.EncodingServices<C["extrakit"]>;

export type SchemaServices<C extends AnyConfig> = DecodingServices<C> & EncodingServices<C>;
