/**
 * A recorded tool payload, as a JSON tree.
 *
 * A payload is `unknown` to `effect/ai` — the toolkit that would name its shape
 * is not the one a recording is read with — so {@link ToolPayload} is where it is
 * read: `Predicate.isObjectOrArray` narrows it to a tree, and a payload that is
 * neither an object nor an array has nothing to open and is shown as the JSON
 * value it is.
 *
 * The tree's own stylesheet is not used, because it draws colours the caller is
 * expected to override anyway; the classes here are the app's tokens instead, so
 * a tree keeps the theme of the card it sits in.
 */

import { Predicate } from "effect";
import type { Prompt } from "effect/ai";
import type { ComponentProps } from "react";
import { JsonView, collapseAllNested } from "react-json-view-lite";

type JsonViewStyles = NonNullable<ComponentProps<typeof JsonView>["style"]>;

const styles: JsonViewStyles = {
  container: "font-mono text-xs leading-5 break-words whitespace-pre-wrap",
  basicChildStyle: "",
  childFieldsContainer: "m-0 list-none p-0 ps-4",
  label: "me-1",
  clickableLabel: "me-1 cursor-pointer",
  nullValue: "text-muted-foreground",
  undefinedValue: "text-muted-foreground",
  stringValue: "text-emerald-700 dark:text-emerald-400",
  numberValue: "text-blue-700 dark:text-blue-400",
  booleanValue: "text-violet-700 dark:text-violet-400",
  otherValue: "",
  punctuation: "text-muted-foreground",
  expandIcon:
    "inline-block w-3 cursor-pointer select-none text-muted-foreground after:content-['▸']",
  collapseIcon:
    "inline-block w-3 cursor-pointer select-none text-muted-foreground after:content-['▾']",
  collapsedContent: "cursor-pointer select-none text-muted-foreground after:content-['…']",
  // `ariaLables` is the library's own spelling of the key.
  ariaLables: { collapseJson: "Collapse JSON", expandJson: "Expand JSON" },
  // Shown as the JSON string a payload recorded, not as the value it may hold.
  stringifyStringValues: false,
};

/**
 * A recorded tool payload — the parameters of a call, or the result of one — as
 * a JSON tree.
 *
 * **When to use**
 *
 * Use for the payload a tool part recorded, which only the tool that recorded it
 * knows the shape of.
 *
 * **Details**
 *
 * The payload is annotated as the field of the part it is read from, so a part
 * that carries something other than `unknown` there is followed by this
 * component as well. Only the first level of the payload is open — the top-level
 * fields of a tool payload are the ones worth scanning — and everything below it
 * is opened by the reader.
 *
 * @category components
 */
export const ToolPayload = ({ payload }: { payload: Prompt.ToolCallPart["params"] }) =>
  Predicate.isObjectOrArray(payload) ? (
    <JsonView data={payload} style={styles} shouldExpandNode={collapseAllNested} />
  ) : (
    <span className="font-mono text-xs break-all whitespace-pre-wrap">
      {JSON.stringify(payload, null, 2)}
    </span>
  );
