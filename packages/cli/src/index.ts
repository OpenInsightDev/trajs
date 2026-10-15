#!/usr/bin/env node
/**
 * The `trajs` command line: what a `.trajs` recording states about itself,
 * without opening it in a viewer.
 *
 * The commands are built with `effect/cli` and run on Node through
 * `@effect/platform-node`, so a command reads and writes files, standard
 * output and the terminal through the services the platform layer provides.
 * This module is the entry point: it holds the root command the subcommands
 * hang off and runs it.
 */

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/cli";

import pkg from "../package.json" with { type: "json" };
import { inspect } from "./inspect.ts";

const cli = Command.make("trajs").pipe(
  Command.withDescription("Read what a `.trajs` recording states about itself."),
  Command.withSubcommands([inspect]),
  Command.withExamples([
    {
      command: "trajs inspect recording.trajs",
      description: "Print the header a recording states, on one line",
    },
    {
      command: "trajs inspect recording.trajs --indent 2",
      description: "Print the header indented by two spaces",
    },
  ]),
);

// The platform layer carries the file system, the path helpers and the terminal
// the command is parsed and run with, and `runMain` reports what a command fails
// with and exits non-zero on it.
NodeRuntime.runMain(
  Command.run(cli, { version: pkg.version }).pipe(Effect.provide(NodeServices.layer)),
);
