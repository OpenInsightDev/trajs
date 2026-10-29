import { Schema } from "effect";

import * as Metric from "#/Metric.ts";
import type * as MetricKit from "#/MetricKit.ts";

// A stored body is the body a part states, so the split stays one description.
export { EventBody, PromptBody, ResponseBody, SessionBody } from "#/Trajectory.ts";

export type {
  EventBodyEncoded,
  PromptBodyEncoded,
  ResponseBodyEncoded,
  SessionBodyEncoded,
} from "#/Trajectory.ts";

// A metric body holds the result alone: the meta names the metric whose result
// it is, and holds that result's `attach` list.
type WithoutAttach<T> = T extends unknown ? Omit<T, "attach"> : never;

type ResultOf<T> = WithoutAttach<T extends { readonly data: infer Data } ? Data : never>;

export type BodyResult<K extends MetricKit.Any> = ResultOf<
  Schema.Schema.Type<ReturnType<typeof Metric.MetricParts<K>>>
>;

type BodyResultEncoded<K extends MetricKit.Any> = ResultOf<
  Schema.Codec.Encoded<ReturnType<typeof Metric.MetricParts<K>>>
>;

const resultsOf = <K extends MetricKit.Any>(
  metrickit: K,
): Schema.Codec<BodyResult<K>, BodyResultEncoded<K>> => {
  const results = Metric.MetricParts(metrickit).members.map((part) => part.fields.data);

  const stored = results.map((result) =>
    result.mapMembers((members) =>
      members.map((member) => member.mapFields(({ attach: _attach, ...rest }) => rest)),
    ),
  );

  // SAFETY: every member is a result of a metric the kit declares with `attach`
  // removed, which is what `BodyResult` reads a kit's results as.
  return Schema.Union(stored) as any;
};

export const MetricBody = <K extends MetricKit.Any>(metrickit: K) =>
  Schema.Struct({ data: resultsOf(metrickit) });

export type MetricBody<K extends MetricKit.Any> = Schema.Schema.Type<
  ReturnType<typeof MetricBody<K>>
>;

export type MetricBodyEncoded = Schema.Codec.Encoded<ReturnType<typeof MetricBody<MetricKit.Any>>>;
