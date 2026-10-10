import { expect, it } from "vite-plus/test";
import * as countModule from "#/Count.ts";
import * as encodingModule from "#/Encoding.ts";
import * as packageEntry from "#/index.ts";
import * as tokenizerModule from "#/Tokenizer.ts";

it("re-exports the modules of the package", () => {
  expect(packageEntry.Count.promptPart).toBe(countModule.promptPart);
  expect(packageEntry.Count.mediaTokens).toBe(countModule.mediaTokens);
  expect(packageEntry.Encoding.Encoding).toBe(encodingModule.Encoding);
  expect(packageEntry.Tokenizer.Tokenizer).toBe(tokenizerModule.Tokenizer);
  expect(packageEntry.Tokenizer.Tokenizer.layerFromEncoding).toBe(
    tokenizerModule.Tokenizer.layerFromEncoding,
  );
});
