import { Generated } from "@effect/ai-anthropic";
import { OpenAiClient } from "@effect/ai-openai-compat";
import type { Effect } from "effect";

import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

export type OpenAiCompatMessage = OpenAiClient.ChatCompletionRequestMessage;

export type OpenAiCompatSessions = Record<string, OpenAiCompatMessage[]>;

export const makeOpenAiCompat = <
  K extends Trajectory.AnyKit,
  V extends Trajectory.AnyVariant,
  E,
  R,
>(
  trajectory: Trajectory.Trajectory<K, V, E, R>,
): Effect.Effect<AnthropicSessions, E | TrajectoryError, R> => {
  throw new Error("Not implemented yet");
};

export type AnthropicMessage = Generated.BetaInputMessage;

export type AnthropicConversation = Readonly<{
  system?: string | ReadonlyArray<Generated.BetaRequestTextBlock>;
  messages: ReadonlyArray<AnthropicMessage>;
}>;

export type AnthropicSessions = Record<string, AnthropicConversation>;

export const makeAnthropic = <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R>(
  trajectory: Trajectory.Trajectory<K, V, E, R>,
): Effect.Effect<AnthropicSessions, E | TrajectoryError, R> => {
  throw new Error("Not implemented yet");
};
