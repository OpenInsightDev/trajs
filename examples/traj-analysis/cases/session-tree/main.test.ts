/**
 * A run read as the sessions it was forked into: each session on its own — the turns it ran on, the
 * tools it called, and what its requests were billed — and the run across them, which the one
 * stream the parts arrived in does not say.
 *
 * A session is forked at a part of another, so its model was given the parts of that one up to the
 * part it was forked at, and what it did is its own: `Session.stream` is both. Two consequences
 * follow. A part belongs to the session that produced it and is only inherited by the sessions
 * forked off it, so what a session was billed is summed over the requests it made itself — summing
 * the session streams would bill the prefix again for every fork. And the first request of a session
 * forked off another is billed for the context it inherited, which is what fanning out cost on top
 * of the work the run was billed for.
 *
 * What the run is, and how its parts were produced, is `fixture.ts`.
 */

import { expect, it } from "@effect/vitest";
import { Session, SessionTree, Trajectory } from "@trajs/core";
import { Effect, Option, Result, Stream } from "effect";

import { trajectory } from "./fixture.ts";

/** What one session was read as: the turns it ran on, what it called, and what it was billed. */
interface Reading {
  readonly id: string;
  /** The session it continues from, and `null` for the mainline. */
  readonly forkedFrom: string | null;
  /** The turns it ran on: the ones it inherited, and the ones it was asked itself. */
  readonly turns: { readonly inherited: number; readonly own: number };
  /** The tools it called itself, and how often each was called. */
  readonly tools: Readonly<Record<string, number>>;
  /** The requests it made itself, and what they were billed. */
  readonly requests: number;
  readonly input: number;
  readonly output: number;
  /**
   * The input of the first request it made itself, which is the context it inherited where it
   * continues from another.
   */
  readonly firstRequest: number;
}

/** What one session was read as, beside what the sessions forked off it came to. */
interface SessionReport extends Reading {
  /** What the session and every session forked off it were billed. */
  readonly subtree: { readonly input: number; readonly output: number };
  /** What of the run's input the session itself was billed, to four places. */
  readonly share: number;
}

/** What the run was read as. */
interface Report {
  /** Each session of the run, in the order it was forked into: the mainline first. */
  readonly sessions: ReadonlyArray<SessionReport>;
  /** What the run was billed, each session's own requests counted once. */
  readonly input: number;
  readonly output: number;
  /** What the sessions forked off another were billed for the context they inherited. */
  readonly inherited: { readonly input: number; readonly share: number };
}

const main = Effect.fn(function* () {
  const sessions = yield* Session.toSessions(trajectory);
  const tree = SessionTree.fromSessions(sessions);

  // The sessions in the order they were forked into — a session before the sessions forked off it,
  // which is also the order a rollup of them is read back in.
  const ids = SessionTree.sessionIds(tree);

  // One pass over each session, folded as its parts arrive: what it inherited, the turns it was
  // asked, the tools it called, and what its requests were billed. The parts come out of the
  // trajectory `toSessions` cached once, so reading a session costs no pass over the run.
  const readings = yield* Effect.forEach(ids, (id) => {
    const session = Option.getOrThrow(Session.session(id)(sessions));

    return session.stream.pipe(
      // A metric part states no session of its own, and this run's kits contribute none, so the
      // parts a kit contributes are read past.
      Stream.filterMap((part) =>
        part._tag === "Prompt" || part._tag === "Response" ? Result.succeed(part) : Result.failVoid,
      ),
      Stream.runFold(
        (): Reading => ({
          id,
          forkedFrom: Option.match(session.forkedFrom, {
            onNone: () => null,
            onSome: (fork) => fork.session,
          }),
          turns: { inherited: 0, own: 0 },
          tools: {},
          requests: 0,
          input: 0,
          output: 0,
          firstRequest: 0,
        }),
        (reading, part) => {
          // A part of the session is one it states: a part it inherited states the session it was
          // forked off, or states none at all, which is the main session.
          const own = (part.sessionId ?? Trajectory.mainSessionId) === id;

          if (part._tag === "Prompt") {
            return own
              ? { ...reading, turns: { ...reading.turns, own: reading.turns.own + 1 } }
              : { ...reading, turns: { ...reading.turns, inherited: reading.turns.inherited + 1 } };
          }

          if (!own) return reading;

          const response = part.response;

          if (response.type === "tool-call") {
            return {
              ...reading,
              tools: { ...reading.tools, [response.name]: (reading.tools[response.name] ?? 0) + 1 },
            };
          }

          if (response.type !== "finish") return reading;

          const input = response.usage.inputTokens.total ?? 0;

          return {
            ...reading,
            requests: reading.requests + 1,
            input: reading.input + input,
            output: reading.output + (response.usage.outputTokens.total ?? 0),
            // The first request a session makes itself is the one given the context it inherited.
            firstRequest: reading.requests === 0 ? input : reading.firstRequest,
          };
        },
      ),
    );
  });

  // What each session's subtree was billed: the tree is walked a session before the sessions forked
  // off it, so walking it back adds every fork of a session to it before the session itself is.
  const subtrees = new Map<string, { readonly input: number; readonly output: number }>();

  for (const { id, forkedFrom, input, output } of readings.toReversed()) {
    const subtree = {
      input: (subtrees.get(id)?.input ?? 0) + input,
      output: (subtrees.get(id)?.output ?? 0) + output,
    };

    subtrees.set(id, subtree);

    if (forkedFrom === null) continue;

    const forked = subtrees.get(forkedFrom);

    subtrees.set(forkedFrom, {
      input: (forked?.input ?? 0) + subtree.input,
      output: (forked?.output ?? 0) + subtree.output,
    });
  }

  // What the run was billed: each session's own requests added up, which is the parts of the run
  // counted once — a part a session inherited is billed to the session that produced it alone.
  const total = readings.reduce(
    (total, { input, output }) => ({ input: total.input + input, output: total.output + output }),
    { input: 0, output: 0 },
  );

  const share = (input: number): number =>
    total.input === 0 ? 0 : Math.round((input / total.input) * 10_000) / 10_000;

  // What fanning out cost: the first request of a session forked off another is billed for the
  // context it inherited, which the session it was forked off was billed for already.
  const inherited = readings
    .filter(({ forkedFrom }) => forkedFrom !== null)
    .reduce((sum, { firstRequest }) => sum + firstRequest, 0);

  return {
    sessions: readings.map((reading): SessionReport => ({
      ...reading,
      subtree: subtrees.get(reading.id) ?? { input: reading.input, output: reading.output },
      share: share(reading.input),
    })),
    input: total.input,
    output: total.output,
    inherited: { input: inherited, share: share(inherited) },
  } satisfies Report;
});

it.effect("main", () =>
  main().pipe(
    Effect.map(({ sessions, input, output, inherited }) => {
      // The sessions in the order they were forked into: the mainline, the historian forked off the
      // mainline's `task` call, and the archivist forked off the historian's.
      expect(sessions.map(({ id }) => id)).toEqual(["main", "historian", "archivist"]);

      const [mainline, historian, archivist] = sessions;

      // Read on its own, the mainline was asked three turns, took four requests to answer them, and
      // called three tools.
      expect(mainline.turns).toEqual({ inherited: 0, own: 3 });
      expect(mainline.requests).toBe(4);
      expect(mainline.tools).toEqual({ grep: 1, read_file: 1, task: 1 });
      expect(mainline.input).toBe(10_700);
      expect(mainline.output).toBe(772);

      // Read across the run, a session continues the one it names and holds as many of its turns as
      // the fork reached: the historian started on the mainline's three, the archivist on those and
      // the historian's own — and neither holds the answer to the call it was forked at.
      expect(historian.forkedFrom).toBe("main");
      expect(archivist.forkedFrom).toBe("historian");
      expect(historian.turns).toEqual({ inherited: 3, own: 1 });
      expect(archivist.turns).toEqual({ inherited: 4, own: 1 });

      // What each did itself and what it was billed, which is its own turns, requests and tools and
      // never the ones it inherited.
      expect(historian.requests).toBe(3);
      expect(historian.tools).toEqual({ bash: 1, task: 1 });
      expect(historian.input).toBe(9_770);
      expect(historian.output).toBe(560);
      expect(archivist.requests).toBe(2);
      expect(archivist.tools).toEqual({ bash: 1 });
      expect(archivist.input).toBe(7_890);
      expect(archivist.output).toBe(380);

      // The run was billed for what the three sessions produced, each part once: summing the session
      // streams instead would bill the inherited prefix again for every fork.
      expect(input).toBe(10_700 + 9_770 + 7_890);
      expect(output).toBe(772 + 560 + 380);

      // A subtree is a session with the sessions forked off it: the historian's is what it and the
      // archivist did, and the mainline's is the whole run.
      expect(historian.subtree).toEqual({ input: 17_660, output: 940 });
      expect(archivist.subtree).toEqual({ input: 7_890, output: 380 });
      expect(mainline.subtree).toEqual({ input, output });

      // Of what the run spent on input, the mainline was a little over a third: the work it delegated
      // was the rest of it.
      expect(mainline.share).toBe(0.3773);
      expect(historian.share).toBe(0.3445);
      expect(archivist.share).toBe(0.2782);

      // Each fork's first request was billed for the context it inherited: almost a quarter of the
      // run's input was context it had already paid for, read again.
      expect(historian.firstRequest).toBe(2_760);
      expect(archivist.firstRequest).toBe(3_880);
      expect(inherited).toEqual({ input: 6_640, share: 0.2341 });
    }),
  ),
);
