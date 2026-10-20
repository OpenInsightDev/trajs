/**
 * The sessions of a trajectory, as the tree the forks make them: every session the
 * trajectory declares as a root sits beside the other roots, and every session forked
 * off one is nested under the session that produced the part it continues from.
 *
 * A session is one row — the id it goes by, and where it continues from one of them,
 * the session it was forked off — and nothing beside it: the nesting is the fork, the
 * part it was forked at is there on request (`title`), and what one of them holds is
 * what opening it shows.
 */

import { ScrollArea } from "@trajs/ui-shadcn/scroll-area";
import { cn } from "cn";
import { Option } from "effect";
import { Fragment } from "react";

import type { TrajectorySession } from "@/lib/trajectory";

const SessionRow = ({
  session,
  selected,
  onSelect,
}: {
  session: TrajectorySession;
  selected: string | undefined;
  onSelect: (id: string) => void;
}) => (
  <Fragment>
    <button
      type="button"
      aria-current={session.id === selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
        "hover:bg-muted aria-[current=true]:bg-muted",
      )}
      onClick={() => onSelect(session.id)}
    >
      <span className="truncate font-mono text-xs">{session.id}</span>
      {Option.isSome(session.continuesFrom) ? (
        <span
          className="truncate text-xs text-muted-foreground"
          title={`continues ${session.continuesFrom.value.sessionId} at ${session.continuesFrom.value.partUuid}`}
        >
          {`continues ${session.continuesFrom.value.sessionId}`}
        </span>
      ) : null}
    </button>
    {session.forks.length === 0 ? null : (
      <div className="ms-2 flex flex-col gap-0.5 border-s border-border ps-2">
        {session.forks.map((fork) => (
          <SessionRow key={fork.id} session={fork} selected={selected} onSelect={onSelect} />
        ))}
      </div>
    )}
  </Fragment>
);

export const SessionTree = ({
  roots,
  selected,
  onSelect,
}: {
  roots: ReadonlyArray<TrajectorySession>;
  selected: string | undefined;
  onSelect: (id: string) => void;
}) => (
  <div className="flex h-full min-h-0 flex-col">
    <div className="border-b px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">Sessions</span>
    </div>
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-0.5 p-2">
        {roots.map((session) => (
          <SessionRow key={session.id} session={session} selected={selected} onSelect={onSelect} />
        ))}
      </div>
    </ScrollArea>
  </div>
);
