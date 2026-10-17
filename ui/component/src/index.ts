/**
 * The mapping from `effect/ai`'s prompt and response models to shadcn/ui, as
 * the React components that render them: one component per part, the message
 * and prompt layouts that arrange them, the JSON tree a tool payload is read in,
 * and the reading of a response that is still arriving.
 *
 * The shapes a prompt and a response share are rendered once, by the prompt
 * components; `response.tsx` adds the parts only a response carries, and
 * `stream.tsx` adds the stream those parts arrive in.
 *
 * The components are styled with shadcn's semantic tokens and render with the
 * components `@trajs/shadcn` copies in; {@link ToolPayload} and the message
 * stylesheet they are read with are this package's own. Import
 * `@trajs/component/styles.css` once, in the stylesheet that imports Tailwind, and
 * see the README for the `@source` lines Tailwind needs to see the classes.
 *
 * The mark trajs is drawn with is drawn here as well: {@link Logo} and
 * {@link Icon}, which take the colour and the size of wherever they are read.
 */

export {
  PromptFile,
  PromptMessage,
  PromptPart,
  PromptReasoning,
  PromptText,
  PromptToolApprovalRequest,
  PromptToolApprovalResponse,
  PromptToolCall,
  PromptToolResult,
  PromptView,
} from "./prompt.tsx";

export type { PromptTextVariant } from "./prompt.tsx";

export { ResponseFinish, ResponseMetadata, ResponsePart, ResponseSource } from "./response.tsx";

export type { AnyResponsePart } from "./response.tsx";

export { ResponseError, ResponseStream, ResponseToolParams } from "./stream.tsx";

export type { AnyStreamPart } from "./stream.tsx";

export { ToolPayload } from "./tool-payload.tsx";

export { Icon, Logo } from "./logo.tsx";
