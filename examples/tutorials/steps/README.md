# Reading a conversation as steps

`View.steps` groups a session's flat parts into turns: one step per prompt, one
per reply. A reply is several parts — text, a tool call, its result, more text —
so a count over parts counts pieces, not replies. `View.steps` groups the run
into its steps before it emits, so a step is one whole turn.

```ts
const main = Effect.gen(function* () {
  const session = yield* Session.main(trajectory);

  const steps = View.steps(session.stream);
  // Prompt, Response, Prompt, Response, ...
});
```

A prompt is a step of its own. The response parts that arrive before the next
prompt or event are one `Response` step; that prompt, that event, or the end of
input closes it. Metric reports and session declarations are not steps.

`View.steps` reads one session, so give it `session.stream` for that session
alone, or `Session.stream(session)` to put the inherited conversation in front.
`Session.main` reads the trajectory through `Cache` and replays it, so the
effect needs a layer: `Cache.layer()` keeps the parts in memory,
`Cache.layerFsTemp()` spills them to a temporary directory.

What a step does not keep: the uuid, timestamp, and extra fields of the response
parts, because the step holds the response parts and not the trajectory parts. A
`Prompt` step does keep its prompt part. When you want the
whole conversation rather than its turns — to build the next model call —
`View.prompt` folds a session into one prompt.

The trajectory here is two turns of weather questions. Counting steps instead of
parts gives 2 prompts and 2 replies, 6 messages, 26 characters of answer text,
and two `get_weather` calls.

```sh
vp test steps
```
