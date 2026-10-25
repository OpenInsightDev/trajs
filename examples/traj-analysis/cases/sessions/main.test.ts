import { expect, it } from "@effect/vitest";
import { Cache, Session, View } from "@trajs/core";
import { Effect, Result, Stream } from "effect";

import { trajectory } from "./fixture.ts";

interface Reading {
  readonly id: string;

  readonly continuesFrom: string | null;

  readonly turns: { readonly inherited: number; readonly own: number };

  readonly tools: Readonly<Record<string, number>>;

  readonly requests: number;
  readonly input: number;
  readonly output: number;

  readonly firstRequest: number;
}

interface SessionReport extends Reading {
  readonly share: number;
}

interface Report {
  readonly sessions: ReadonlyArray<SessionReport>;

  readonly input: number;
  readonly output: number;

  readonly inherited: { readonly input: number; readonly share: number };
  readonly delegated: { readonly input: number; readonly share: number };
}

const main = Effect.fn(function* () {
  const root = yield* Session.main(trajectory);

  type Branch = typeof root | (typeof root)["forkBy"][string];

  const branches: Array<Branch> = [];

  const visit = (branch: Branch): void => {
    branches.push(branch);

    for (const child of Object.values(branch.forkBy)) visit(child);
  };

  visit(root);

  const readings = yield* Effect.forEach(branches, (branch) =>
    Effect.gen(function* () {
      const full = Session.stream(branch);

      const reading = yield* branch.stream.pipe(
        Stream.filterMap((part) =>
          part._tag === "Prompt" || part._tag === "Response"
            ? Result.succeed(part)
            : Result.failVoid,
        ),
        Stream.runFold(
          (): Reading => ({
            id: branch.id,
            continuesFrom: "forkFrom" in branch ? branch.forkFrom.session.id : null,
            turns: { inherited: 0, own: 0 },
            tools: {},
            requests: 0,
            input: 0,
            output: 0,
            firstRequest: 0,
          }),
          (reading, part) => {
            if (part._tag === "Prompt") {
              return { ...reading, turns: { ...reading.turns, own: reading.turns.own + 1 } };
            }

            const response = part.response;

            if (response.type === "tool-call") {
              return {
                ...reading,
                tools: {
                  ...reading.tools,
                  [response.name]: (reading.tools[response.name] ?? 0) + 1,
                },
              };
            }

            if (response.type !== "finish") return reading;

            const input = response.usage.inputTokens.total ?? 0;

            return {
              ...reading,
              requests: reading.requests + 1,
              input: reading.input + input,
              output: reading.output + (response.usage.outputTokens.total ?? 0),
              firstRequest: reading.requests === 0 ? input : reading.firstRequest,
            };
          },
        ),
      );

      const turns = yield* View.steps(full).pipe(
        Stream.filter((step) => step._tag === "Prompt"),
        Stream.runCount,
      );

      return {
        ...reading,
        turns: { inherited: turns - reading.turns.own, own: reading.turns.own },
      };
    }),
  );

  const total = readings.reduce(
    (total, { input, output }) => ({ input: total.input + input, output: total.output + output }),
    { input: 0, output: 0 },
  );

  const share = (input: number): number =>
    total.input === 0 ? 0 : Math.round((input / total.input) * 10_000) / 10_000;

  const forked = readings.filter(({ continuesFrom }) => continuesFrom !== null);

  const delegatedInput = forked.reduce((input, reading) => input + reading.input, 0);

  const inheritedInput = forked.reduce((input, { firstRequest }) => input + firstRequest, 0);

  return {
    sessions: readings.map((reading): SessionReport => ({
      ...reading,
      share: share(reading.input),
    })),
    input: total.input,
    output: total.output,
    inherited: { input: inheritedInput, share: share(inheritedInput) },
    delegated: { input: delegatedInput, share: share(delegatedInput) },
  } satisfies Report;
});

it.effect("main", () =>
  main().pipe(
    Effect.map(({ sessions, input, output, inherited, delegated }) => {
      expect(sessions.map(({ id }) => id)).toEqual(["main", "historian", "archivist"]);
      expect(sessions.map(({ continuesFrom }) => continuesFrom)).toEqual([
        null,
        "main",
        "historian",
      ]);

      const [mainline, historian, archivist] = sessions;

      expect(mainline.turns).toEqual({ inherited: 0, own: 3 });
      expect(mainline.requests).toBe(4);
      expect(mainline.tools).toEqual({ grep: 1, read_file: 1, task: 1 });
      expect(mainline.input).toBe(10_700);
      expect(mainline.output).toBe(772);

      expect(historian.turns).toEqual({ inherited: 3, own: 1 });
      expect(archivist.turns).toEqual({ inherited: 4, own: 1 });

      expect(historian.requests).toBe(3);
      expect(historian.tools).toEqual({ bash: 1, task: 1 });
      expect(historian.input).toBe(9_770);
      expect(historian.output).toBe(560);
      expect(archivist.requests).toBe(2);
      expect(archivist.tools).toEqual({ bash: 1 });
      expect(archivist.input).toBe(7_890);
      expect(archivist.output).toBe(380);

      expect(input).toBe(10_700 + 9_770 + 7_890);
      expect(output).toBe(772 + 560 + 380);

      expect(mainline.share).toBe(0.3773);
      expect(historian.share).toBe(0.3445);
      expect(archivist.share).toBe(0.2782);

      expect(historian.firstRequest).toBe(2_760);
      expect(archivist.firstRequest).toBe(3_880);

      expect(delegated).toEqual({ input: 9_770 + 7_890, share: 0.6227 });
      expect(inherited).toEqual({ input: 6_640, share: 0.2341 });
    }),
    Effect.provide(Cache.layer()),
  ),
);
