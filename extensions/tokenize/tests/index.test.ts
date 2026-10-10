import { expect, it } from "vite-plus/test";
import * as countModule from "#/Count.ts";
import * as encodingModule from "#/Encoding.ts";
import * as extensionModule from "#/Extension.ts";
import * as packageEntry from "#/index.ts";
import * as tokenizerModule from "#/Tokenizer.ts";

it("re-exports the modules of the package", () => {
  expect(packageEntry.Count.promptPart).toBe(countModule.promptPart);
  expect(packageEntry.Count.mediaTokens).toBe(countModule.mediaTokens);
  expect(packageEntry.Encoding.Encoding).toBe(encodingModule.Encoding);
  // The extension is re-exported directly rather than as a namespace.
  expect(packageEntry.Estimate).toBe(extensionModule.Estimate);
  expect(packageEntry.annotate).toBe(extensionModule.annotate);
  expect(packageEntry.extension).toBe(extensionModule.extension);
  expect(packageEntry.extensions).toBe(extensionModule.extensions);
  expect(packageEntry.of).toBe(extensionModule.of);
  expect(packageEntry.registry).toBe(extensionModule.registry);
  expect(packageEntry.Tokenizer.Tokenizer).toBe(tokenizerModule.Tokenizer);
  expect(packageEntry.Tokenizer.Tokenizer.layerFromEncoding).toBe(
    tokenizerModule.Tokenizer.layerFromEncoding,
  );
});
