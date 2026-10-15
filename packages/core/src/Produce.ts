import type { Effect, Stream } from "effect";

import * as Event from "#/Event.ts";
import * as Extra from "#/Extra.ts";
import * as Metric from "#/Metric.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Tool from "#/Tool.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";

import type { TrajectoryError } from "./TrajectoryError.ts";

export type SessionStream<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  E = never,
  R = never,
> = Stream.Stream<Prompt.Prompt | Response.AllParts<Tools> | Event.EventParts<Events>, E, R>;

export const transform =
  <
    Toolkit extends Toolkit.Any,
    Eventkit extends Event.AnyKit,
    Metrickit extends Metric.AnyKit,
    Extrakit extends Extra.AnyKit,
  >({
    toolkit,
    eventkit,
    extrakit,
    metadata,
  }: {
    toolkit: Toolkit;
    eventkit: Eventkit;
    metrickit: Metric.WithProducers<Metrickit>;
    extrakit: Extrakit;
    metadata: Trajectory.Metadata;
  }) =>
  <E, R>(
    stream: SessionStream<Toolkit["tools"], Eventkit["events"], E, R>,
  ): Trajectory.Trajectory<
    {
      stream: true;
      toolkit: Toolkit;
      eventkit: Eventkit;
      metrickit: Metrickit;
      extrakit: Extrakit;
    },
    E,
    R
  > => {
    throw new Error("Not implemented");
  };

export type ProduceSession<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
> = Readonly<{
  id: string;
  enqueuePrompt: (
    message: Prompt.Prompt,
    options?: Extra.ExtraRecord<Extras, "prompt">,
  ) => Effect.Effect<Trajectory.PromptPart<Extra.Extrakit<Extras>>>;
  enqueueResponse: (
    response: Response.AllPartsView<Tools>,
    options?: Extra.ExtraRecord<Extras, "response">,
  ) => Effect.Effect<Trajectory.ResponsePart<Toolkit.Toolkit<Tools>, Extra.Extrakit<Extras>, true>>;
  enqueueEvent: (
    event: Event.EventPartsView<Events>,
  ) => Effect.Effect<Trajectory.EventPart<Event.Eventkit<Events>>>;
}>;

export type Producer<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
> = Readonly<{
  createSession: (
    options: {
      id: string;
      fork?: string;
    } & Extra.ExtraRecord<Extras, "session">,
  ) => Effect.Effect<ProduceSession<Tools, Events, Extras>, TrajectoryError>;
}>;

type ProduceFn<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
  E = never,
  R = never,
> = (producer: Producer<Tools, Events, Extras>) => Effect.Effect<never, E, R>;

export const produce =
  <
    Toolkit extends Toolkit.Any,
    Eventkit extends Event.AnyKit,
    Metrickit extends Metric.AnyKit,
    Extrakit extends Extra.AnyKit,
  >({
    toolkit,
    eventkit,
    metrickit,
    extrakit,
    metadata,
  }: {
    toolkit: Toolkit;
    eventkit: Eventkit;
    metrickit: Metric.WithProducers<Metrickit>;
    extrakit: Extrakit;
    metadata: Trajectory.Metadata;
  }) =>
  <E, R>(
    fn: ProduceFn<Toolkit["tools"], Eventkit["events"], Extrakit["extra"], E, R>,
  ): Trajectory.Trajectory<
    {
      stream: true;
      toolkit: Toolkit;
      eventkit: Eventkit;
      metrickit: Metrickit;
      extrakit: Extrakit;
    },
    E,
    R
  > => {
    throw new Error("Not implemented");
  };
