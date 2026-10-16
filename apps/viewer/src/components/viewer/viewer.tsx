/**
 * The viewer: a page that reads a `.trajs` file and shows it as the sessions it
 * holds.
 *
 * A recording is opened three ways — the one bundled with the app, a file picked
 * from disk, and a file dropped on the page — and each of them ends in the same
 * place: the bytes are read into the sessions and turns `@/lib/recording` states,
 * `@/components/viewer/session-tree` lays the sessions out as the tree their forks
 * make, and `@/components/viewer/conversation` reads the selected one as the
 * conversation it ran.
 *
 * A recording is read in the page rather than by a server, so the app is the whole
 * of what it needs: `@/lib/recording` reads it with the codecs a page runs —
 * WebAssembly, rather than the `node:zlib` a server would have — and nothing of the
 * viewer goes anywhere.
 */

import { Alert, AlertDescription, AlertTitle } from "@trajs/ui/components/alert";
import { Button } from "@trajs/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@trajs/ui/components/empty";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@trajs/ui/components/resizable";
import { Spinner } from "@trajs/ui/components/spinner";
import { cn } from "cn";
import { Data, Effect } from "effect";
import { Files, LayoutGrid, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { read } from "@/lib/recording";
import type { RecordedSession, Recording } from "@/lib/recording";

import { Conversation } from "./conversation";
import { SessionTree } from "./session-tree";

/** The file the viewer opens by itself, written by `scripts/sample.ts`. */
const sample = `${import.meta.env.BASE_URL}sample.trajs`;

/** A recording to read: what to call it, and the bytes when they arrive. */
interface Source {
  readonly name: string;
  readonly bytes: () => Promise<Uint8Array>;
}

type State =
  | { readonly _tag: "Reading"; readonly name: string }
  | { readonly _tag: "Loaded"; readonly name: string; readonly recording: Recording }
  | { readonly _tag: "Failed"; readonly name: string; readonly message: string };

const State = Data.taggedEnum<State>();

const failureOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Every session of a tree of them, forks included, so one can be found by id. */
const flattened = (sessions: ReadonlyArray<RecordedSession>): ReadonlyArray<RecordedSession> =>
  sessions.flatMap((session) => [session, ...flattened(session.forks)]);

const OpenFileButton = ({ onChoose }: { onChoose: () => void }) => (
  <Button size="sm" variant="outline" onClick={onChoose}>
    Open a recording…
  </Button>
);

/** What is offered when the page holds no conversation to read. */
const OpenAnother = ({ onChoose, onSample }: { onChoose: () => void; onSample: () => void }) => (
  <EmptyContent>
    <OpenFileButton onChoose={onChoose} />
    <Button size="sm" variant="ghost" onClick={onSample}>
      Open the sample
    </Button>
  </EmptyContent>
);

/**
 * The page: what is opened, and the state of opening it. A recording is read once
 * per opening, and the reading that is not the last one to start is dropped rather
 * than shown — opening another file while one is being read is not a race.
 */
export const Viewer = () => {
  const [state, setState] = useState<State>(State.Reading({ name: "sample.trajs" }));
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [dropping, setDropping] = useState(false);
  const latest = useRef(0);
  const picker = useRef<HTMLInputElement>(null);

  const open = useCallback((source: Source) => {
    const token = (latest.current += 1);

    setState(State.Reading({ name: source.name }));

    void source
      .bytes()
      .then((bytes) => Effect.runPromise(Effect.scoped(read(bytes))))
      .then(
        (recording) => {
          if (token !== latest.current) return;

          setSelected(recording.roots[0]?.id);
          setState(State.Loaded({ name: source.name, recording }));
        },
        (cause: unknown) => {
          if (token !== latest.current) return;

          setState(State.Failed({ name: source.name, message: failureOf(cause) }));
        },
      );
  }, []);

  const openSample = useCallback(
    () =>
      open({
        name: "sample.trajs",
        bytes: async () => {
          const response = await fetch(sample);

          if (!response.ok) {
            throw new Error(`${sample} could not be read (${response.status})`);
          }

          return new Uint8Array(await response.arrayBuffer());
        },
      }),
    [open],
  );

  const openFile = useCallback(
    (chosen: File) =>
      open({ name: chosen.name, bytes: async () => new Uint8Array(await chosen.arrayBuffer()) }),
    [open],
  );

  // The sample is what the viewer opens on, so that it has something to show
  // before anything of anyone's own is handed to it.
  useEffect(() => openSample(), [openSample]);

  const recording = State.$is("Loaded")(state) ? state.recording : undefined;
  const failure = State.$is("Failed")(state) ? state.message : undefined;

  const session =
    recording === undefined
      ? undefined
      : flattened(recording.roots).find((candidate) => candidate.id === selected);

  return (
    <main
      className={cn(
        "flex h-dvh min-h-0 flex-col bg-background text-foreground",
        dropping && "ring-2 ring-ring ring-inset",
      )}
      onDragLeave={() => setDropping(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDropping(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropping(false);

        const chosen = event.dataTransfer.files[0];

        if (chosen !== undefined) openFile(chosen);
      }}
    >
      {/* What the recording is called, and what it was read from, which is on
          request rather than beside it. */}
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        {recording === undefined ? null : (
          <span className="truncate text-sm font-medium" title={state.name}>
            {state.name}
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          <OpenFileButton onChoose={() => picker.current?.click()} />
          <Button
            aria-label="Component gallery"
            nativeButton={false}
            render={<a href="#/components" title="Component gallery" />}
            size="icon-sm"
            variant="ghost"
          >
            <LayoutGrid />
          </Button>
        </div>
      </header>

      <input
        accept=".trajs"
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0];

          if (chosen !== undefined) openFile(chosen);

          // The same file picked twice is opened twice.
          event.target.value = "";
        }}
        ref={picker}
        type="file"
      />

      {recording !== undefined && session !== undefined ? (
        <ResizablePanelGroup className="min-h-0 flex-1" orientation="horizontal">
          <ResizablePanel defaultSize="300px" maxSize="520px" minSize="180px">
            <SessionTree onSelect={setSelected} roots={recording.roots} selected={selected} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel className="min-h-0">
            {/* Keyed by the session, so another one is read from its own top. */}
            <Conversation key={session.id} session={session} />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : failure !== undefined ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>{`Failed to read ${state.name}`}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>What it failed with</AlertTitle>
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          </EmptyContent>
          <OpenAnother onChoose={() => picker.current?.click()} onSample={openSample} />
        </Empty>
      ) : recording === undefined ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Spinner />
            </EmptyMedia>
            <EmptyTitle>{`Reading ${state.name}…`}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Files />
            </EmptyMedia>
            <EmptyTitle>This recording holds no sessions</EmptyTitle>
          </EmptyHeader>
          <OpenAnother onChoose={() => picker.current?.click()} onSample={openSample} />
        </Empty>
      )}
    </main>
  );
};
