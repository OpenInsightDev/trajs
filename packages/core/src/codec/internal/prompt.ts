/**
 * What the codecs of this module read of a prompt: the text and the images of its
 * parts, and the text a provider is handed a tool result as.
 */

import { Predicate } from "effect";
import type { Prompt } from "effect/ai";

/** The text of the parts given. */
export const textOf = (parts: ReadonlyArray<Prompt.Part>): string => {
  let text = "";

  for (const part of parts) {
    if (part.type === "text") text += part.text;
  }

  return text;
};

/** The images of the parts given, which a model states as file parts. */
export const imagesOf = (parts: ReadonlyArray<Prompt.Part>): ReadonlyArray<Prompt.FilePart> => {
  const images: Prompt.FilePart[] = [];

  for (const part of parts) {
    if (part.type === "file" && part.mediaType.startsWith("image/")) images.push(part);
  }

  return images;
};

/**
 * The result of a tool as the text a provider is handed it as: the string a result
 * already is, and the JSON of every other value.
 */
export const resultText = (result: Prompt.ToolResultPart["result"]): string =>
  Predicate.isString(result) ? result : (JSON.stringify(result) ?? String(result));

/**
 * The media type an image is stated as: the one the part produces, and JPEG where it
 * produces only that the part is an image.
 */
export const mediaTypeOf = (part: Prompt.FilePart): string =>
  part.mediaType === "image/*" ? "image/jpeg" : part.mediaType;
