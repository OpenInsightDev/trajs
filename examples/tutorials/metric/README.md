# Measuring parts with a metric

A `Metric` declares a number you derive from a trajectory — how much text a tool
result handed back, how long a step took — and nothing else. The declaration
holds what a measurement is (`output`) and why one could not be made
(`failure`). The code that measures is a _producer_, registered against the
declaration in a `MetricKit`.

```ts
const toolText = new Metric.Metric({
  packageName: "tutorial",
  id: "ToolText",
  metadata: new Metric.Metadata({ name: "Tool result text" }),
  packageMetadata: { version: "0.0.0" },
  output: characters, // versioned schema
  failure: notText, // versioned schema
});

const counted = MetricKit.toProducers(MetricKit.make(toolText), {
  [toolText.tag]: measure,
});

const results = Metric.produce(counted)(trajectory);
```

`packageName` is written out as a literal, so `toolText.tag` is typed
`"tutorial/ToolText"` rather than as a string. `metadata` describes the metric
itself. `packageMetadata` is what the package that declares it states of itself in
its `package.json`, which here is written out for the tutorial package: a stored
result is traced back to the package and the release that produced it.

A producer is a function from parts to a stream of measurements. Emit
`Metric.makeOutput(value, { attach })` for a part you measured. `attach` names
the uuids of the parts measured, which is how the result is later tied to those
parts and to their session; without it the result is trajectory-wide. Where
there is nothing to measure, fail with `Metric.makeFailure(reason, { attach })`:
that becomes one `Failure` result instead of a measurement.

A `Failure` ends the producer that raised it, and the other producers keep
running, but the parts after the one it could not read are not measured either.
A metric that should skip bad input has to skip it rather than fail on it.
`Metric.produce` runs a producer over the parts of a trajectory, so a producer
only ever sees finished parts.

Both schemas are versioned, so a stored result stays readable when a field is
added or renamed: the result names its version and reading it runs the
migration. `View.metricOutputs(metric)` selects one metric's successful outputs
from a part stream. [`View.metricTrajectory`](../metric-trajectory/README.md)
reads a whole trajectory into parts that carry the results naming them, so a
part can be shown beside the numbers measured about it. Producing streams the
results; to keep them in the trajectory, the declaration goes on the config's
`metrickit` — a metric part under a tag the config does not declare does not
decode.

The measurements here are over tool results. Two results hold text, so two
results come back: 16 characters from `grep` and 64 from `read_file`, 80 in all.
The third result is a PNG, so the producer reports `not-text` — the read says
what it could not measure instead of quietly leaving it out.

```sh
vp test metric
```
