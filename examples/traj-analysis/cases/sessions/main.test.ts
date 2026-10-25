import { expect, it } from "@effect/vitest";
import { Cache, Session } from "@trajs/core";
import { Effect, Stream } from "effect";

import { trajectory } from "./fixture.ts";

interface Report {
  readonly sessions: ReadonlyArray<{
    readonly id: string;
    readonly forkFrom: string | null;
    readonly prompts: { readonly inherited: number; readonly produced: number };
    readonly tools: Readonly<Record<string, number>>;
    readonly finishes: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly firstInputTokens: number;
    readonly share: number;
  }>;

  readonly inputTokens: number;
  readonly outputTokens: number;
}

const main = Effect.fn(function* () {
  const root = yield* Session.main(trajectory);

  const noTools: Readonly<Record<string, number>> = {};

  const sessions = yield* Effect.forEach(Session.all(root), (session) =>
    Effect.gen(function* () {
      const produced = yield* session.stream.pipe(
        Stream.runFold(
          () => ({
            prompts: 0,
            tools: noTools,
            finishes: 0,
            inputTokens: 0,
            outputTokens: 0,
            firstInputTokens: 0,
          }),
          (produced, part) => {
            switch (part._tag) {
              case "Prompt":
                return { ...produced, prompts: produced.prompts + 1 };

              case "Response": {
                const response = part.response;

                switch (response.type) {
                  case "tool-call":
                    return {
                      ...produced,
                      tools: {
                        ...produced.tools,
                        [response.name]: (produced.tools[response.name] ?? 0) + 1,
                      },
                    };

                  case "finish": {
                    const inputTokens = response.usage.inputTokens.total ?? 0;

                    return {
                      ...produced,
                      finishes: produced.finishes + 1,
                      inputTokens: produced.inputTokens + inputTokens,
                      outputTokens:
                        produced.outputTokens + (response.usage.outputTokens.total ?? 0),
                      firstInputTokens:
                        produced.finishes === 0 ? inputTokens : produced.firstInputTokens,
                    };
                  }

                  default:
                    return produced;
                }
              }

              default:
                return produced;
            }
          },
        ),
      );

      // Session.stream includes the inherited prefix. Produced prompts are subtracted.
      const prompts = yield* Session.stream(session).pipe(
        Stream.filter((part) => part._tag === "Prompt"),
        Stream.runCount,
      );

      return {
        id: session.id,
        forkFrom: "forkFrom" in session ? session.forkFrom.session.id : null,
        prompts: { inherited: prompts - produced.prompts, produced: produced.prompts },
        tools: produced.tools,
        finishes: produced.finishes,
        inputTokens: produced.inputTokens,
        outputTokens: produced.outputTokens,
        firstInputTokens: produced.firstInputTokens,
      };
    }),
  );

  const summed = sessions.reduce(
    (summed, session) => ({
      inputTokens: summed.inputTokens + session.inputTokens,
      outputTokens: summed.outputTokens + session.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );

  return {
    sessions: sessions.map((session) => ({
      ...session,
      share:
        summed.inputTokens === 0
          ? 0
          : Math.round((session.inputTokens / summed.inputTokens) * 10_000) / 10_000,
    })),
    inputTokens: summed.inputTokens,
    outputTokens: summed.outputTokens,
  } satisfies Report;
});

it.effect("main", () =>
  main().pipe(
    Effect.map(({ sessions, inputTokens, outputTokens }) => {
      expect(sessions.map(({ id }) => id)).toEqual(["main", "historian", "archivist"]);
      expect(sessions.map(({ forkFrom }) => forkFrom)).toEqual([null, "main", "historian"]);

      const [mainSession, historian, archivist] = sessions;

      expect(mainSession.prompts).toEqual({ inherited: 0, produced: 3 });
      expect(mainSession.finishes).toBe(4);
      expect(mainSession.tools).toEqual({ grep: 1, read_file: 1, task: 1 });
      expect(mainSession.inputTokens).toBe(10_700);
      expect(mainSession.outputTokens).toBe(772);

      expect(historian.prompts).toEqual({ inherited: 3, produced: 1 });
      expect(archivist.prompts).toEqual({ inherited: 4, produced: 1 });

      expect(historian.finishes).toBe(3);
      expect(historian.tools).toEqual({ bash: 1, task: 1 });
      expect(historian.inputTokens).toBe(9_770);
      expect(historian.outputTokens).toBe(560);
      expect(archivist.finishes).toBe(2);
      expect(archivist.tools).toEqual({ bash: 1 });
      expect(archivist.inputTokens).toBe(7_890);
      expect(archivist.outputTokens).toBe(380);

      expect(inputTokens).toBe(10_700 + 9_770 + 7_890);
      expect(outputTokens).toBe(772 + 560 + 380);

      expect(mainSession.share).toBe(0.3773);
      expect(historian.share).toBe(0.3445);
      expect(archivist.share).toBe(0.2782);

      expect(historian.firstInputTokens).toBe(2_760);
      expect(archivist.firstInputTokens).toBe(3_880);
    }),
    Effect.provide(Cache.layer()),
  ),
);
