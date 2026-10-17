import { ButtonVariants } from "./demos/button-variants";
import {
  PromptFileDemo,
  PromptMessageDemo,
  PromptPartDemo,
  PromptReasoningDemo,
  PromptTextDemo,
  PromptToolApprovalRequestDemo,
  PromptToolApprovalResponseDemo,
  PromptToolCallDemo,
  PromptToolResultDemo,
  PromptViewDemo,
  ResponseErrorDemo,
  ResponseFinishDemo,
  ResponseMetadataDemo,
  ResponsePartDemo,
  ResponseSourceDemo,
  ResponseStreamDemo,
  ResponseToolParamsDemo,
  ToolPayloadDemo,
} from "./mapping/demos";
import { Palette } from "./palette";
import { Preview } from "./preview";

/**
 * What Markdown may use without importing it. The names are the contract the
 * pages are written against — the demo a page shows and the surface it is shown
 * on — while a component a page renders itself it imports from the package it
 * lives in, which is the point of these pages being React rather than a template
 * language.
 *
 * The demos are here rather than imported by the page that shows one because
 * every one of them is the app's own: a package component is named by the page
 * that renders it, but a demo is only the sample and the labels a page reads a
 * component in.
 */
export const mdxComponents = {
  ButtonVariants,
  Palette,
  Preview,
  PromptFileDemo,
  PromptMessageDemo,
  PromptPartDemo,
  PromptReasoningDemo,
  PromptTextDemo,
  PromptToolApprovalRequestDemo,
  PromptToolApprovalResponseDemo,
  PromptToolCallDemo,
  PromptToolResultDemo,
  PromptViewDemo,
  ResponseErrorDemo,
  ResponseFinishDemo,
  ResponseMetadataDemo,
  ResponsePartDemo,
  ResponseSourceDemo,
  ResponseStreamDemo,
  ResponseToolParamsDemo,
  ToolPayloadDemo,
};
