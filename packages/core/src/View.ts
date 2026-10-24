import { Effect, Option, Stream } from "effect";
import { Prompt } from "effect/ai";

import * as Config from "#/Config.ts";
import { collapse } from "#/internal/folding.ts";
import { closed, opened, turnsOf, type Assembly } from "#/internal/view.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";

type Tools<Config extends Config.AnyConfig> = Config["toolkit"]["tools"];

export type PromptTurn<Config extends Config.AnyConfig> = Readonly<{
  prompt: Trajectory.PromptPart<Config["extrakit"]>;
  response: ReadonlyArray<Response.PartView<Tools<Config>>>;
}>;

const assemble = <Config extends Config.AnyConfig>(
  assembly: Assembly<PromptTurn<Config>>,
  part: Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
): readonly [Assembly<PromptTurn<Config>>, ReadonlyArray<PromptTurn<Config>>] => {
  switch (part._tag) {
    case "Prompt":
      // A prompt opens a turn and closes the one before it, whether or not that one
      // was answered, so the turns are emitted in the order they were produced in.
      return [opened<PromptTurn<Config>>({ prompt: part, response: [] }), turnsOf(assembly)];

    case "Response": {
      const open = assembly.turn;

      // A response is on the turn the prompt before it opened; one no prompt precedes is on no
      // turn, and is dropped. A part that states no session belongs to the main session, as one
      // stating `"main"` does.
      const session = part.sessionId ?? Trajectory.mainSessionId;

      if (
        Option.isNone(open) ||
        (open.value.prompt.sessionId ?? Trajectory.mainSessionId) !== session
      ) {
        return [assembly, []];
      }

      const [folding, folded] = collapse(assembly.folding, session, part.response);
      const response = [...open.value.response, ...folded];

      return [{ turn: Option.some({ prompt: open.value.prompt, response }), folding }, []];
    }

    default:
      return [assembly, []];
  }
};

export const promptTurns = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<PromptTurn<Config>, E, R> =>
  stream.pipe(
    Stream.mapAccum(closed<PromptTurn<Config>>, assemble<Config>, {
      // The turn the parts end in has no prompt after it to close it, so the parts ending is
      // what closes it.
      onHalt: turnsOf,
    }),
  );

export const prompt = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E, R> =>
  promptTurns(stream).pipe(
    Stream.runFold(
      () => Prompt.empty,
      (folded, turn) =>
        folded.pipe(
          Prompt.concat(Prompt.fromMessages(turn.prompt.messages)),
          Prompt.concat(Prompt.fromResponseParts(turn.response)),
        ),
    ),
  );

export type ToolTurn<Config extends Config.AnyConfig> = Readonly<{
  call: Response.ToolCallPartsView<Tools<Config>>;
  result: Response.ToolResultPartsView<Tools<Config>>;
}>;

export const toolTurns = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<ToolTurn<Config>, E, R> =>
  stream.pipe(
    Stream.mapAccum(
      () => new Map<string, Response.ToolCallPartsView<Tools<Config>>>(),
      (calls, part) => {
        if (part._tag !== "Response") return [calls, []];

        const response = part.response;

        switch (response.type) {
          case "tool-call":
            calls.set(response.id, response);

            return [calls, []];
          case "tool-result": {
            if (response.preliminary) return [calls, []];

            const call = calls.get(response.id);

            if (call === undefined) return [calls, []];

            calls.delete(response.id);

            return [calls, [{ call, result: response }]];
          }

          default:
            return [calls, []];
        }
      },
    ),
  );
