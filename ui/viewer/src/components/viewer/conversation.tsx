/**
 * One session's conversation, as the message stream it is.
 *
 * The parts are `@trajs/ui-component`'s: the messages a model was given are read by
 * `PromptMessage`, which is what a message of a prompt is mapped to, and what it
 * answered with by `ResponsePart`, which is what a response part is mapped to. What
 * this adds is the arrangement neither of those models states: the turns of one
 * session in order, and, where it inherited any, the turns of the sessions it
 * continues from read above its own.
 *
 * What a session says of itself is said once: the tree states which session
 * continues from which, so a stretch is named here only where a session reads more
 * than its own turns, and a reader meets one session's turns after another's.
 */

import { PromptMessage, ResponsePart } from "@trajs/ui-component";
import type { AnyResponsePart } from "@trajs/ui-component";
import { Avatar, AvatarFallback } from "@trajs/ui-shadcn/avatar";
import { Marker, MarkerContent } from "@trajs/ui-shadcn/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "@trajs/ui-shadcn/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@trajs/ui-shadcn/message-scroller";
import { Option } from "effect";
import { Fragment } from "react";

import type { TrajectorySession, Stretch, Turn } from "@/lib/trajectory";

/**
 * What a model answered a turn with, as its side of the conversation: a response
 * has no role of its own, and it is the model's, so it sits where an assistant's
 * message sits.
 */
const Answer = ({ parts }: { parts: ReadonlyArray<AnyResponsePart> }) => (
  <Message align="start">
    <MessageAvatar>
      <Avatar>
        <AvatarFallback>A</AvatarFallback>
      </Avatar>
    </MessageAvatar>
    <MessageContent>
      <MessageHeader>Assistant</MessageHeader>
      {parts.map((part, index) => (
        <ResponsePart key={index} part={part} />
      ))}
    </MessageContent>
  </Message>
);

/**
 * One turn: the messages a model was given, and what it answered with. A prompt
 * that no response follows is a turn a model was given and did not answer, which
 * is what a trajectory of a turn that was cut short holds.
 */
const TurnView = ({ turn, id }: { turn: Turn; id: string }) => (
  <MessageScrollerItem messageId={id}>
    <MessageGroup className="gap-6">
      {turn.prompt.messages.map((message, index) => (
        <PromptMessage key={index} message={message} />
      ))}
      {turn.response.length === 0 ? (
        <Marker variant="separator">
          <MarkerContent>no answer was produced</MarkerContent>
        </Marker>
      ) : (
        <Answer parts={turn.response} />
      )}
    </MessageGroup>
  </MessageScrollerItem>
);

const StretchView = ({ stretch, note }: { stretch: Stretch; note?: string }) => (
  <Fragment>
    {note === undefined ? null : (
      <MessageScrollerItem>
        <Marker variant="border">
          <MarkerContent>
            <span className="font-mono">{stretch.sessionId}</span>
            <span className="text-muted-foreground">{` · ${note}`}</span>
          </MarkerContent>
        </Marker>
      </MessageScrollerItem>
    )}
    {stretch.turns.map((turn, index) => (
      <TurnView key={index} turn={turn} id={`${stretch.sessionId}-${index}`} />
    ))}
  </Fragment>
);

/**
 * The conversation a session ran: what it inherited from the sessions it continues
 * from — each stretch read from the session that produced it — then its own turns.
 */
export const Conversation = ({ session }: { session: TrajectorySession }) => {
  // What a session continues from is said where its own turns begin, which is where
  // a reader meets it — and not at all where it reads its own turns alone, since
  // there is then nothing to tell one stretch of the conversation from another.
  const continues = Option.isSome(session.continuesFrom)
    ? `continues ${session.continuesFrom.value.sessionId}`
    : undefined;

  return (
    // A session is read from the top: a trajectory has already happened, so what is
    // newest is not what a reader came for.
    <MessageScrollerProvider defaultScrollPosition="start">
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-4 px-6 py-8">
            {session.inherited.map((stretch, index) => (
              <StretchView
                key={`${stretch.sessionId}-${index}`}
                note="inherited"
                stretch={stretch}
              />
            ))}
            <StretchView
              note={continues}
              stretch={{ sessionId: session.id, turns: session.turns }}
            />
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
};
