import { expect, it } from "vite-plus/test";
import { Schema, SchemaGetter } from "effect";
import * as Extension from "#/Extension.ts";

/** A line of four versions, declared the way an extension declares one. */
const V1 = Extension.Versions.make(
  Schema.Struct({ version: Schema.Literal("1.0"), url: Schema.String }),
);

const V2 = V1.pipe(
  Extension.Versions.upgrade(
    (fields) => ({ ...fields, version: Schema.Literal("1.1"), host: Schema.String }),
    {
      decode: SchemaGetter.transform((from) => ({
        ...from,
        version: "1.1" as const,
        host: new URL(from.url).hostname,
      })),
    },
  ),
);

const V3 = V2.pipe(
  Extension.Versions.upgrade(
    (fields) => ({ ...fields, version: Schema.Literal("1.2"), port: Schema.Number }),
    {
      decode: SchemaGetter.transform((from) => ({ ...from, version: "1.2" as const, port: 443 })),
    },
  ),
);

const V4 = V3.pipe(
  Extension.Versions.upgrade(
    (fields) => ({ ...fields, version: Schema.Literal("1.3"), secure: Schema.Boolean }),
    {
      decode: SchemaGetter.transform((from) => ({
        ...from,
        version: "1.3" as const,
        secure: from.port === 443,
      })),
    },
  ),
);

const newest = {
  version: "1.3" as const,
  url: "https://example.com",
  host: "example.com",
  port: 443,
  secure: true,
};

const documents = [
  { version: "1.0", url: "https://example.com" },
  { version: "1.1", url: "https://example.com", host: "example.com" },
  { version: "1.2", url: "https://example.com", host: "example.com", port: 443 },
  newest,
];

it("reads every version of a line into the newest one's value", () => {
  for (const document of documents) {
    expect(Schema.decodeUnknownSync(V4)(document)).toEqual(newest);
  }
});

it("holds one reader per version of its own, not one per version below it", () => {
  expect([V1, V2, V3, V4].map((version) => version.members.length)).toEqual([1, 2, 2, 2]);
});

it("encodes only the newest version", () => {
  expect(Schema.encodeSync(V4)(newest)).toEqual(newest);
  expect(() =>
    Schema.encodeUnknownSync(V4)({ version: "1.0", url: "https://example.com" }),
  ).toThrow();
});

it("reads two lines at once, keeping them distinct", () => {
  const W1 = Extension.Versions.make(
    Schema.Struct({ version: Schema.Literal("w1"), spanId: Schema.String }),
  );

  const both = Extension.Versions.across(V4, W1);

  expect(Schema.decodeUnknownSync(both)({ version: "1.0", url: "https://example.com" })).toEqual(
    newest,
  );
  expect(Schema.decodeUnknownSync(both)({ version: "w1", spanId: "s1" })).toEqual({
    version: "w1",
    spanId: "s1",
  });
});

it("reads an older recording as the newest version of an extension", () => {
  const otel = Extension.make(
    "dev.observerw.otel",
    Extension.Metadata.make({ name: "OpenTelemetry" }),
    Extension.Versions.make(
      Schema.Struct({ version: Schema.Literal("1.0.0"), spanId: Schema.String }),
    ),
  );

  const timed = otel.pipe(
    Extension.upgrade(
      (fields) => ({ ...fields, version: Schema.Literal("1.1.0"), durationMs: Schema.Number }),
      { decode: (from) => ({ ...from, version: "1.1.0" as const, durationMs: 0 }) },
    ),
  );

  expect(Schema.decodeUnknownSync(timed.version)({ version: "1.0.0", spanId: "s1" })).toEqual({
    version: "1.1.0",
    spanId: "s1",
    durationMs: 0,
  });
});
