#!/usr/bin/env node
/**
 * The `trajs` command line.
 *
 * The root command holds {@link inspect} and runs on the Node runtime.
 */

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/cli";

import pkg from "../package.json" with { type: "json" };
import { inspect } from "./inspect.ts";

const cli = Command.make("trajs").pipe(
  Command.withDescription("Read what a `.trajs` trajectory states about itself."),
  Command.withSubcommands([inspect]),
  Command.withExamples([
    {
      command: "trajs inspect trajectory.trajs",
      description: "Print the header a trajectory states, on one line",
    },
    {
      command: "trajs inspect trajectory.trajs --metadata",
      description: "Print what the trajectory states at its end, on one line",
    },
    {
      command: "trajs inspect trajectory.trajs --indent 2",
      description: "Print the header indented by two spaces",
    },
  ]),
);

// `runMain` reports the failure of a command and exits non-zero on it.
NodeRuntime.runMain(
  Command.run(cli, { version: pkg.version }).pipe(Effect.provide(NodeServices.layer)),
);
