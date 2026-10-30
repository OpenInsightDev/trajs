import { Effect, Schema } from "effect";

import * as Extra from "#/Extra.ts";
import type * as ExtraKit from "#/ExtraKit.ts";
import { TimestampInt, UuidFromByte } from "#/internal/schema.ts";
import * as Prompt from "#/Prompt.ts";
import type * as Trajectory from "#/Trajectory.ts";

// The meta and the body of one stored part.
// A reader reads the meta without decompressing, and decodes the body with its kits.
export type ExchangePart<Meta, Body> = Readonly<{ meta: Meta; body: Body }>;

export interface PromptPartMetaEncoded {
  uuid: Uint8Array;
  sessionId?: string;
  timestamp?: number;
  startTimestamp?: number;
}

export interface PromptPartBodyEncoded {
  messages: Prompt.MessageEncoded[];
}

const Messages = Schema.Union([
  Prompt.SystemMessage,
  Prompt.UserMessage,
  Prompt.AssistantMessage,
  Prompt.ToolMessage,
]).pipe(Schema.Array, Schema.mutable);

const promptPart = Schema.Struct({
  _tag: Schema.tagDefaultOmit("Prompt"),
  uuid: UuidFromByte,
  sessionId: Schema.optional(Schema.String),
  timestamp: Schema.optional(TimestampInt),
  startTimestamp: Schema.optional(TimestampInt),
  messages: Messages,
  extra: Extra.Held.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
}).annotate({ identifier: "PromptPart" });

export const PromptPart = (): Schema.Codec<
  Trajectory.PromptPart<ExtraKit.Any>,
  PromptPartMetaEncoded & PromptPartBodyEncoded
> => promptPart;
