import type * as EventKit from "#/EventKit.ts";
import type * as ExtraKit from "#/ExtraKit.ts";
import type {
  BodyResult,
  EventBody,
  MetricBody,
  PromptBody,
  ResponseBody,
  SessionBody,
} from "#/internal/exchange/body.ts";
import type {
  EventMeta,
  MetricMeta,
  PromptMeta,
  ResponseMeta,
  SessionMeta,
} from "#/internal/exchange/meta.ts";
import type * as MetricKit from "#/MetricKit.ts";
import type * as Toolkit from "#/Toolkit.ts";
import type * as Trajectory from "#/Trajectory.ts";

// The meta and the body of one stored part.
// A reader reads the meta without decompressing, and decodes the body with its kits.
export type ExchangePart<Meta, Body> = Readonly<{ meta: Meta; body: Body }>;

// A decoded body alone names no kit, so each direction is given the kit its body
// was read with, which is what types the part it produces or consumes.

export const toSessionPart = <K extends ExtraKit.Any>(
  extrakit: K,
  exchange: ExchangePart<SessionMeta, SessionBody<K>>,
): Trajectory.SessionPart<K> => ({ ...exchange.meta, ...exchange.body });

export const toPromptPart = <K extends ExtraKit.Any>(
  extrakit: K,
  exchange: ExchangePart<PromptMeta, PromptBody<K>>,
): Trajectory.PromptPart<K> => ({ ...exchange.meta, ...exchange.body });

export const toResponsePart = <Toolkit extends Toolkit.Any, Extras extends ExtraKit.Any>(
  kits: { readonly toolkit: Toolkit; readonly extrakit: Extras },
  exchange: ExchangePart<ResponseMeta, ResponseBody<Toolkit, Extras>>,
): Trajectory.ResponsePart<Toolkit, Extras> => ({ ...exchange.meta, ...exchange.body });

export const toEventPart = <K extends EventKit.Any>(
  eventkit: K,
  exchange: ExchangePart<EventMeta, EventBody<K>>,
): Trajectory.EventPart<K> => ({ ...exchange.meta, ...exchange.body });

export const toMetricPart = <K extends MetricKit.Any>(
  metrickit: K,
  exchange: ExchangePart<MetricMeta, MetricBody<K>>,
): Trajectory.MetricPart<K> => {
  const { meta, body } = exchange;
  const { attach } = meta;
  const data = attach === undefined ? body.data : { ...body.data, attach };

  // SAFETY: the meta names the metric whose result the body holds, so the two
  // are one metric part; they are decoded apart, so no type pairs the tag with
  // the result.
  return {
    _tag: meta._tag,
    metric: { _tag: meta.metricTag, data },
    timestamp: meta.timestamp,
    startTimestamp: meta.startTimestamp,
  } as Trajectory.MetricPart<K>;
};

// The other direction: a part as the meta and the body a writer stores.

export const fromSessionPart = <K extends ExtraKit.Any>(
  extrakit: K,
  part: Trajectory.SessionPart<K>,
): ExchangePart<SessionMeta, SessionBody<K>> => ({
  meta: { _tag: part._tag, type: part.type, uuid: part.uuid },
  body: { extra: part.extra },
});

export const fromPromptPart = <K extends ExtraKit.Any>(
  extrakit: K,
  part: Trajectory.PromptPart<K>,
): ExchangePart<PromptMeta, PromptBody<K>> => ({
  meta: {
    _tag: part._tag,
    uuid: part.uuid,
    sessionId: part.sessionId,
    timestamp: part.timestamp,
    startTimestamp: part.startTimestamp,
  },
  body: { messages: part.messages, extra: part.extra },
});

export const fromResponsePart = <Toolkit extends Toolkit.Any, Extras extends ExtraKit.Any>(
  kits: { readonly toolkit: Toolkit; readonly extrakit: Extras },
  part: Trajectory.ResponsePart<Toolkit, Extras>,
): ExchangePart<ResponseMeta, ResponseBody<Toolkit, Extras>> => ({
  meta: {
    _tag: part._tag,
    uuid: part.uuid,
    sessionId: part.sessionId,
    timestamp: part.timestamp,
    startTimestamp: part.startTimestamp,
  },
  body: { response: part.response, extra: part.extra },
});

export const fromEventPart = <K extends EventKit.Any>(
  eventkit: K,
  part: Trajectory.EventPart<K>,
): ExchangePart<EventMeta, EventBody<K>> => ({
  meta: {
    _tag: part._tag,
    uuid: part.uuid,
    sessionId: part.sessionId,
    timestamp: part.timestamp,
    startTimestamp: part.startTimestamp,
  },
  body: { event: part.event },
});

export const fromMetricPart = <K extends MetricKit.Any>(
  metrickit: K,
  part: Trajectory.MetricPart<K>,
): ExchangePart<MetricMeta, MetricBody<K>> => {
  const { attach, ...data } = part.metric.data;

  return {
    meta: {
      _tag: part._tag,
      metricTag: part.metric._tag,
      attach,
      timestamp: part.timestamp,
      startTimestamp: part.startTimestamp,
    },
    // SAFETY: the data is the part's own result less the `attach` list the meta
    // states above, which is what `BodyResult` names for that result.
    body: { data: data as BodyResult<K> },
  };
};
