import { Data, Formatter, Schema } from "effect";
import type { Toolkit } from "effect/ai";

const listed = (members: ReadonlyArray<string>): string =>
  members.length > 0 ? members.join(", ") : "none";

export class ToolEncodeError extends Data.TaggedError("ToolEncodeError")<{
  toolkit: Toolkit.Any;
  cause: Schema.SchemaError;
}> {
  override get message(): string {
    const tools = listed(Object.keys(this.toolkit.tools));

    return `Failed to encode a response part with the toolkit (${tools}): ${this.cause.message}`;
  }
}

export class ToolDecodeError extends Data.TaggedError("ToolDecodeError")<{
  toolkit: Toolkit.Any;
  cause: Schema.SchemaError;
}> {
  override get message(): string {
    const tools = listed(Object.keys(this.toolkit.tools));

    return `Failed to decode a response part with the toolkit (${tools}): ${this.cause.message}`;
  }
}

export type SessionErrorReason = "unproduced-fork" | "late-declaration" | "undeclared-session";

const sessionFailure: Record<SessionErrorReason, string> = {
  "unproduced-fork":
    "it continues from a part the trajectory does not hold, or one no session continues from",
  "late-declaration": "it was declared after the parts it produced",
  "undeclared-session": "it is named by a part, and no session part declares it",
};

export class SessionError extends Data.TaggedError("SessionError")<{
  id: string;
  reason: SessionErrorReason;
}> {
  override get message(): string {
    return `Failed to read session '${this.id}': ${sessionFailure[this.reason]}`;
  }
}

export class ParseError extends Data.TaggedError("ParseError")<{
  cause: unknown;
}> {
  override get message(): string {
    return `Failed to read or write a trajectory: ${Formatter.format(this.cause)}`;
  }
}

export type TrajectoryErrorReason = ToolEncodeError | ToolDecodeError | SessionError | ParseError;

export class TrajectoryError extends Data.TaggedError("TrajectoryError")<{
  reason: TrajectoryErrorReason;
}> {
  override readonly cause = this.reason;

  override get message(): string {
    return this.reason.message;
  }

  static encodeTool = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ToolEncodeError({ toolkit, cause }) });

  static decodeTool = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ToolDecodeError({ toolkit, cause }) });

  static session = (id: string, reason: SessionErrorReason) =>
    new TrajectoryError({ reason: new SessionError({ id, reason }) });

  static parse = (cause: unknown) => new TrajectoryError({ reason: new ParseError({ cause }) });
}
