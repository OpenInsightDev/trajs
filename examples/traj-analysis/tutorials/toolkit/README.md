# Typed tool calls

A tool call is recorded as a name and a params payload. Unless the config knows
the tool, that payload stays `unknown`. A `Toolkit` is where you declare the
tools a trajectory uses: each one gets its parameters and its success schema,
and the toolkit goes on the config.

```ts
const toolkit = Toolkit.make(
  Tool.make("search_docs", {
    parameters: Schema.Struct({ query: Schema.String, limit: Schema.Number }),
    success: Schema.Array(Schema.String),
  }),
);

const config = Config.config({ toolkit });

const calls = View.toolCalls(session.stream);
```

`Tool` and `Toolkit` are re-exported from Effect's `@effect/ai`, so the schemas
are Effect Schemas and a declaration can still carry a handler for real
production. The typing follows the config: `Config.config` keeps the toolkit's
types, so `query` is a `string` where the call is read, not `unknown`.

`View.toolCalls` emits every call in session order, including calls to tools the
toolkit does not declare — those keep `params` as `unknown` rather than being
dropped or failing the read. So a reader matches the declared names and keeps an
`orElse` for the rest. `View.toolTurns` pairs each call with its final result,
for when the result matters and not just the call.

The trajectory stores the params as the toolkit encoded them, so the toolkit is
not travelling with the data: two programs reading the same trajectory need the
same toolkit to read its calls typed. For a program that keeps the declarations
themselves, `Toolkit.encode` writes them as JSON Schema.

The run here calls three declared tools and fetches a page with one nobody
registered. Reading with the toolkit gives the cities, the search queries, the
largest `limit` asked for (20), and the file extensions (`ts`, `md`), plus one
`web_fetch` counted as undescribed.

```sh
vp test tutorials/toolkit
```
