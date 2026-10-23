/**
 * What a producer of a count carries from one part of a trajectory to the next.
 *
 * A count of one part is not the whole of what a trajectory states of it. What a
 * session had been worth up to that part is a property of the parts before it as
 * well, and so is what a tool result's call is worth beside the result. The
 * producer of the metric therefore reads a trajectory in one pass, and this
 * module is the step it takes of each part: the state it carries, and what one
 * part adds to it.
 *
 * The state is one running count per session, keyed by the session a part states — the
 * main session where it states none of its own — rather than by the sessions a
 * trajectory declares, because the parts are read in one pass rather than grouped by
 * session. It is made where a stream starts rather than by the producer, so a producer
 * run over two trajectories counts each of them from its own beginning.
 */

import { Trajectory } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Option, Predicate } from "effect";
import { Tokenizer } from "effect/ai";
import type { AiError } from "effect/ai";

import { carriesAnyOf, countedOf } from "#/internal/count.ts";
import { countOf, noCalls } from "#/internal/datum.ts";
import { mediaRuleOf } from "#/internal/media.ts";
import type { CountedPart } from "#/internal/part.ts";
import type { ProducerOptions } from "#/Metrics.ts";
import type { TokenCount } from "#/Tokens.ts";

/**
 * What one part of a trajectory is worth, and what its session had been worth up
 * to it.
 *
 * A part is named by its `uuid` rather than carried: what the metric produces of a
 * part is a report about that part, and the part itself is already in the
 * trajectory — see `Metrics` for the output a measurement becomes.
 */
export interface Measured {
  /** `uuid` of the part the count is about. */
  readonly attach: string;
  /** What the part is worth. */
  readonly count: TokenCount;
  /** Tokens the session of the part had been worth up to and including it. */
  readonly total: number;
}

/**
 * What one session has been counted for so far.
 *
 * @see {@link Sessions} for the state a step carries.
 */
export interface SessionCount {
  /** Tokens the parts of the session counted so far are worth, the part just counted among them. */
  total: number;
  /** What each tool call of the session is worth, by the call's identifier. */
  readonly calls: Map<string, number>;
}

/** What each session a trajectory has reached has been counted for so far. */
export type Sessions = Map<string, SessionCount>;

/** The state a step starts from: no session counted yet. */
export const sessions = (): Sessions => new Map();

/**
 * The running count of one session, made when the first of its parts is counted.
 *
 * A part names its session by `sessionId`, and the parts of a trajectory are read
 * in one pass rather than grouped by session, so a session's count is made where
 * it is first counted. A part of a session no earlier part declared is therefore
 * counted all the same, from the beginning of that session's count.
 */
const sessionOf = (state: Sessions, id: string): SessionCount => {
  const existing = state.get(id);

  if (existing !== undefined) return existing;

  const made: SessionCount = { total: 0, calls: new Map() };

  state.set(id, made);

  return made;
};

/**
 * Whether a part of a trajectory is one a count is taken from: what a model was
 * given, or what it returned. Every other part of a trajectory — a session
 * declaration, an event, a count already derived — holds nothing a tokenizer
 * answers for.
 */
const isCounted = (part: Trajectory.Part<Config.AnyConfig>): part is CountedPart =>
  Predicate.isTagged("Prompt")(part) || Predicate.isTagged("Response")(part);

/**
 * What one part of a trajectory is worth, and the state the part after it is
 * counted from.
 *
 * A part a count is not taken for is skipped rather than counted as nothing, so a
 * kit derives a datum for the parts it counted and no others: a session
 * declaration, an event, a count already derived, a kind of response part that
 * carries no content, or one whose messages carry no kind a call named. A
 * response part is one message part itself, so it is counted by the kind it
 * carries rather than by the kinds of a message.
 */
export type Step = (
  state: Sessions,
  part: Trajectory.Part<Config.AnyConfig>,
) => Effect.Effect<readonly [Sessions, ReadonlyArray<Measured>], UncountedFailure>;

/**
 * A part a tokenizer failed on: which part it is, and why it was left uncounted.
 *
 * The part is named here rather than by the caller of a step, because a step is
 * the one place that knows which part it failed on — a part of a trajectory is not
 * itself a {@link Measured}, since nothing was measured of it.
 */
export interface UncountedFailure {
  /** `uuid` of the part the tokenizer failed on. */
  readonly attach: string;
  /** The failure of the tokenizer, which is why no count was taken. */
  readonly reason: AiError.AiError;
}

/**
 * Builds the step a producer takes of each part of a trajectory.
 *
 * The step is built with a tokenizer: this asks the run it is built in for one,
 * closes over it, and returns a step that asks the run for no service of its own,
 * so that which tokenizer a trajectory is counted under is chosen where the step
 * is built and travels with it rather than with the kit that runs it.
 */
export const stepOf = Effect.fn("stepOf")(function* (
  options?: ProducerOptions,
): Effect.fn.Return<Step, never, Tokenizer.Tokenizer> {
  const tokenizer = yield* Tokenizer.Tokenizer;

  const countOfPart = (part: CountedPart) =>
    countedOf(part, mediaRuleOf(options?.media)).pipe(
      Effect.provideService(Tokenizer.Tokenizer, tokenizer),
      // What the part is, rather than what it is worth, is what a failure names:
      // the uuid of the part is read where the part is known to be one a count is
      // taken from.
      Effect.mapError((reason): UncountedFailure => ({ attach: part.uuid, reason })),
    );

  return (state, part) =>
    Effect.gen(function* () {
      if (!isCounted(part)) return [state, []] as const;

      const tags = options?.tags;

      if (tags !== undefined && !carriesAnyOf(part, tags)) return [state, []] as const;

      const counted = yield* countOfPart(part);

      // A part that states no session of its own belongs to the main session.
      const sessionId = part.sessionId ?? Trajectory.mainSessionId;
      const known = state.get(sessionId);
      const count = countOf(part, counted, known === undefined ? noCalls : known.calls);

      // A part no count is taken from leaves the state as it was, so that a
      // session is not made for a part which carries nothing a tokenizer answers
      // for.
      if (Option.isNone(count)) return [state, []] as const;

      const session = sessionOf(state, sessionId);

      // What the call of a result is worth is known from the call itself, which
      // the result answers by identifier, so every call a part carries is kept
      // for the result that follows it to read.
      for (const call of counted.calls) session.calls.set(call.id, call.tokens);

      session.total += counted.tokens;

      return [state, [{ attach: part.uuid, count: count.value, total: session.total }]] as const;
    });
});
