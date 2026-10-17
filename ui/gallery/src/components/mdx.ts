import { ButtonVariants } from "./demos/button-variants";
import { DialogDemo } from "./demos/dialog";
import { DrawerDemo } from "./demos/drawer";
import { HoverCardDemo } from "./demos/hover-card";
import { MessageScrollerDemo } from "./demos/message-scroller";
import { QuestionnaireDemo } from "./demos/questionnaire";
import { SheetDemo } from "./demos/sheet";
import { SidebarDemo } from "./demos/sidebar";
import { ToasterDemo } from "./demos/sonner";
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
 *
 * The `demos/` ones are the exception to a page rendering what it shows. A
 * dialog, a hover card, a sheet, a drawer, a sidebar, a message scroller and a
 * questionnaire cannot be rendered in the server graph the page is rendered in —
 * they hold state, read the viewport, or reach a class defined over a client
 * dependency — so each is a `"use client"` module the page names. The mapping's
 * demos are client modules for the same reason: the parts they render fold,
 * stream or scroll.
 */
export const mdxComponents = {
  ButtonVariants,
  DialogDemo,
  DrawerDemo,
  HoverCardDemo,
  MessageScrollerDemo,
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
  QuestionnaireDemo,
  ResponseErrorDemo,
  ResponseFinishDemo,
  ResponseMetadataDemo,
  ResponsePartDemo,
  ResponseSourceDemo,
  ResponseStreamDemo,
  ResponseToolParamsDemo,
  SheetDemo,
  SidebarDemo,
  ToasterDemo,
  ToolPayloadDemo,
};
