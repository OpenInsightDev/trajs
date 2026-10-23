import type { Effect, Stream } from "effect";
import type { Prompt } from "effect/ai";

import * as Config from "#/Config.ts";
import { readPrompt, readToolTurns, readTurns } from "#/internal/view.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import type * as Trajectory from "#/Trajectory.ts";

type Tools<Config extends Config.AnyConfig> = Config["toolkit"]["tools"];

export type PromptTurn<Config extends Config.AnyConfig> = Readonly<{
  prompt: Trajectory.PromptPart<Config["extrakit"]>;
  response: ReadonlyArray<Response.PartView<Tools<Config>>>;
}>;

export const promptTurns = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<PromptTurn<Config>, E, R> => readTurns(stream);

export const prompt = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E, R> => readPrompt(stream);

export type ToolTurn<Config extends Config.AnyConfig> = Readonly<{
  call: Response.ToolCallPartsView<Tools<Config>>;
  result: Response.ToolResultPartsView<Tools<Config>>;
}>;

export const toolTurns = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<ToolTurn<Config>, E, R> => readToolTurns(stream);
