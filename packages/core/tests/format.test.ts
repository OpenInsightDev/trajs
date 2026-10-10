/**
 * Tests the storage formats a `.trajs` file can be written in.
 *
 * The claims these tests hold the formats to are about the bytes of a file, so
 * they check them against BSON and JSON themselves rather than against the
 * format that wrote them.
 */

import { BSON } from "bson";
import { expect, it } from "vite-plus/test";
import { Effect, Option, Stream } from "effect";
import * as Format from "#/Format.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The records of a recording, written as text because a format is handed the
 * records that another producer wrote, not the parts of this package.
 */
const records = [
  JSON.parse('{"metadata":{"version":"1.0.0","name":"greeting"},"toolkit":{},"extkit":{}}'),
  JSON.parse(
    '{"_tag":"Prompt","uuid":"0192f0e2-2f8e-7c1c-9c5e-5c1f9a2f0e2a","messages":[{"role":"user","content":"Hello"}]}',
  ),
];

/** A record that holds itself, which is a document BSON cannot write. */
interface SelfHolding {
  self?: SelfHolding;
}

/** The bytes a format wrote for the records, joined into one buffer. */
const bytesOf = async (
  format: Format.Format,
  written: ReadonlyArray<unknown>,
): Promise<Uint8Array> => {
  const chunks = Array.from(
    await Effect.runPromise(Stream.runCollect(format.encode(Stream.fromIterable(written)))),
  );

  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return bytes;
};

/** The records a format read out of the bytes, however they are chunked. */
const recordsOf = async (
  format: Format.Format,
  bytes: Uint8Array,
  chunks: ReadonlyArray<Uint8Array> = [bytes],
): Promise<ReadonlyArray<unknown>> =>
  Array.from(
    await Effect.runPromise(Stream.runCollect(format.decode(Stream.fromIterable(chunks)))),
  );

/** The same bytes, one byte per chunk, so every document has to span chunks. */
const byteWise = (bytes: Uint8Array): ReadonlyArray<Uint8Array> =>
  Array.from(bytes, (byte) => Uint8Array.of(byte));

it("writes each record as one BSON document, back to back", async () => {
  const bytes = await bytesOf(Format.bson, records);

  let offset = 0;

  for (const record of records) {
    const document = Array.from(BSON.serialize(record));

    expect(Array.from(bytes.subarray(offset, offset + document.length))).toEqual(document);
    offset += document.length;
  }

  // Nothing between the documents: no separator and no trailing bytes.
  expect(bytes.length).toBe(offset);
});

it("reads records back however the bytes are chunked", async () => {
  const bytes = await bytesOf(Format.bson, records);

  expect(await recordsOf(Format.bson, bytes)).toEqual(records);
  expect(await recordsOf(Format.bson, bytes, byteWise(bytes))).toEqual(records);
});

it("fails when a BSON document is cut short", async () => {
  const bytes = await bytesOf(Format.bson, records);
  const cut = bytes.subarray(0, bytes.length - 1);

  const error = await Effect.runPromise(
    Effect.flip(Stream.runCollect(Format.bson.decode(Stream.fromIterable([cut])))),
  );

  expect(error).toBeInstanceOf(TrajectoryError);
});

it("fails when a record cannot be packed as a BSON document", async () => {
  const record: SelfHolding = {};

  record.self = record;

  const error = await Effect.runPromise(
    Effect.flip(Stream.runCollect(Format.bson.encode(Stream.fromIterable([record])))),
  );

  expect(error).toBeInstanceOf(TrajectoryError);
});

it("writes each record as one line of JSON", async () => {
  const bytes = await bytesOf(Format.jsonl, records);
  const text = new TextDecoder().decode(bytes);

  expect(text).toBe(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
});

it("reads records back from lines of JSON", async () => {
  const bytes = await bytesOf(Format.jsonl, records);

  expect(await recordsOf(Format.jsonl, bytes, byteWise(bytes))).toEqual(records);
});

it("fails when a line is not JSON", async () => {
  const bytes = new TextEncoder().encode(`${JSON.stringify(records[0])}\nnot-json\n`);

  const error = await Effect.runPromise(
    Effect.flip(Stream.runCollect(Format.jsonl.decode(Stream.fromIterable([bytes])))),
  );

  expect(error).toBeInstanceOf(TrajectoryError);
});

it("names the format a key ends with", () => {
  expect(Option.getOrThrow(Format.resolve("recording.trajs"))).toBe(Format.jsonl);
  expect(Option.getOrThrow(Format.resolve("recording.trajs.jsonl"))).toBe(Format.jsonl);
  expect(Option.getOrThrow(Format.resolve("recording.trajs.bson"))).toBe(Format.bson);
  expect(Option.isNone(Format.resolve("recording.txt"))).toBe(true);
  expect(Option.isNone(Format.resolve("trajs"))).toBe(true);
});
