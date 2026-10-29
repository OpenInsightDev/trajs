import { Algorithm as HashAlgorithm } from "@trajs/utils/StreamHash";
import { Schema } from "effect";

import type * as Config from "#/Config.ts";
import * as EventKit from "#/EventKit.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import type { ExchangePart } from "#/internal/exchange/part.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Toolkit from "#/Toolkit.ts";

// The header is alone in the first chunk.
// Its meta states the tag alone, and its body names the kits a reader holds
// before it decodes any part.
export const HeaderMeta = Schema.TaggedStruct("Header", {});

export type HeaderMeta = Schema.Schema.Type<typeof HeaderMeta>;

export type HeaderMetaEncoded = Schema.Codec.Encoded<typeof HeaderMeta>;

export const HeaderBody = Schema.Struct({
  version: Schema.String,
  hash: HashAlgorithm,
  toolkit: Toolkit.ToolkitSchema,
  eventkit: EventKit.EventKitSchema,
  metrickit: MetricKit.MetricKitSchema,
  extrakit: ExtraKit.ExtraKitSchema,
});

export type HeaderBody = Schema.Schema.Type<typeof HeaderBody>;

export type HeaderBodyEncoded = Schema.Codec.Encoded<typeof HeaderBody>;

export const headerExchangePart = (
  config: Config.AnyConfig,
  { version, hash }: { readonly version: string; readonly hash: HashAlgorithm },
): ExchangePart<HeaderMeta, HeaderBody> => ({
  meta: HeaderMeta.make({}),
  body: {
    version,
    hash,
    toolkit: Toolkit.encode(config.toolkit),
    eventkit: EventKit.encode(config.eventkit),
    metrickit: MetricKit.encode(config.metrickit),
    extrakit: ExtraKit.encode(config.extrakit),
  },
});
