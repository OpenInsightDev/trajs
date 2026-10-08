import { expect, it } from "vite-plus/test";
import { Schema } from "effect";
import { Tool, Toolkit } from "effect/ai";
import * as Response from "#/Response.ts";

const weather = Tool.make("get_weather", {
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.Struct({ temp: Schema.Number }),
});

const toolkit = Toolkit.make(weather);

const part = Response.PartView(toolkit);

const unknownCall = { type: "tool-call", id: "c1", name: "mystery_tool", params: { x: 1 } };

const knownCall = { type: "tool-call", id: "c2", name: "get_weather", params: { city: "SF" } };

const unknownResult = {
  type: "tool-result",
  id: "c1",
  name: "mystery_tool",
  isFailure: false,
  result: 42,
};

it("decodes tool calls for tools outside the toolkit", () => {
  const decoded = Schema.decodeUnknownSync(part)(unknownCall);
  expect(Response.isAnyToolCallPart(decoded)).toBe(true);
  expect(Response.isAnyToolPart(decoded)).toBe(true);
  expect(decoded).toMatchObject({ name: "mystery_tool", params: { x: 1 } });
});

it("decodes tool results for tools outside the toolkit", () => {
  const decoded = Schema.decodeUnknownSync(part)(unknownResult);
  expect(Response.isAnyToolResultPart(decoded)).toBe(true);
  expect(decoded).toMatchObject({ name: "mystery_tool", result: 42, isFailure: false });
});

it("keeps tools from the toolkit on the typed branch", () => {
  const decoded = Schema.decodeUnknownSync(part)(knownCall);
  expect(Response.isAnyToolPart(decoded)).toBe(false);
  expect(decoded).toMatchObject({ name: "get_weather", params: { city: "SF" } });
});

// Fails if the copied `PartTypeId` drifts from the one `effect/ai/Response` uses.
it("brands decoded parts like `effect/ai/Response` does", () => {
  const unknown = Schema.decodeUnknownSync(part)(unknownCall);
  const known = Schema.decodeUnknownSync(part)(knownCall);
  const result = Schema.decodeUnknownSync(part)(unknownResult);

  expect(Response.isPart(unknown)).toBe(true);
  expect(Response.isPart(known)).toBe(true);
  expect(Response.isPart(result)).toBe(true);
});

it("round-trips decoded tool calls through the encoded form", () => {
  const decoded = Schema.decodeUnknownSync(part)(unknownCall);
  const encoded = Schema.encodeSync(part)(decoded);

  expect(Schema.decodeUnknownSync(part)(encoded)).toEqual(decoded);
});

it("falls back to the unrestricted part when a known tool's params do not match", () => {
  const stale = { type: "tool-call", id: "c9", name: "get_weather", params: { wrong: 1 } };
  const decoded = Schema.decodeUnknownSync(part)(stale);
  expect(Response.isAnyToolCallPart(decoded)).toBe(true);
  expect(decoded).toMatchObject({ params: { wrong: 1 } });
});

it("decodes streaming parts that are not tool parts", () => {
  const stream = Schema.decodeUnknownSync(Response.StreamPartView(toolkit))({
    type: "text-delta",
    id: "t1",
    delta: "hi",
  });

  expect(Response.isAnyToolPart(stream)).toBe(false);
});

it("constructs any tool parts that are recognized by the upstream guard", () => {
  const constructed = Response.anyToolCallPart({
    id: "c3",
    name: "mystery_tool",
    params: {},
    providerExecuted: false,
  });

  expect(Response.isAnyToolCallPart(constructed)).toBe(true);
  expect(Response.isPart(constructed)).toBe(true);
});
