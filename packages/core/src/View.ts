import type { Effect, Stream } from "effect";
import type { Prompt } from "effect/ai";

import { readConversations, readPrompt, readToolTurns, readTurns } from "#/internal/view.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

type Tools<Config extends Trajectory.AnyConfig> = Config["toolkit"]["tools"];

export type PromptTurn<Config extends Trajectory.AnyConfig> = Readonly<{
  prompt: Trajectory.PromptPart<Config["extrakit"]>;
  response: ReadonlyArray<Response.PartView<Tools<Config>>>;
}>;

export const promptTurns = <Config extends Trajectory.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<PromptTurn<Config>, E, R> => readTurns(stream);

export const prompt = <Config extends Trajectory.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E, R> => readPrompt(stream);

export type Conversation = ReadonlyArray<Prompt.Message>;

export const conversations = <Config extends Trajectory.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): Effect.Effect<Record<string, Conversation>, E | TrajectoryError, R> =>
  readConversations(sessions);

export type ToolTurn<Config extends Trajectory.AnyConfig> = Readonly<{
  call: Response.ToolCallPartsView<Tools<Config>>;
  result: Response.ToolResultPartsView<Tools<Config>>;
}>;

export const toolTurns = <Config extends Trajectory.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<ToolTurn<Config>, E, R> => readToolTurns(stream);
