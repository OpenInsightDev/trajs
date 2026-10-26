# Measuring parts with a metric

A `Metric` declares a number you derive from a trajectory — how much text a tool
result handed back, how long a step took — and nothing else. The declaration
holds what a measurement is (`output`) and why one could not be made
(`failure`). The code that measures is a _producer_, registered against the
declaration in a `MetricKit`.

```ts
const toolText = new Metric.Metric({
  package: "tutorial",
  id: "ToolText",
  metadata: new Metric.Metadata({ name: "Tool result text" }),
  output: characters, // versioned schema
  failure: notText, // versioned schema
});

const counted = MetricKit.toProducers(MetricKit.make(toolText), {
  [toolText.tag]: measure,
});

const reports = Metric.produce(counted)(trajectory);
```

A producer is a function from parts to a stream of measurements. Emit
`Metric.makeOutput(value, { attach })` for a part you measured. `attach` names
the part's uuid (or a session id), which is how the report is later tied to the
part it is about; without it the report is trajectory-wide. Where there is
nothing to measure, fail with `Metric.makeFailure(reason, { attach })`: that
becomes one `Failure` report instead of a measurement.

A `Failure` ends the producer that raised it, and the other producers keep
running, but the parts after the one it could not read are not measured either.
A metric that should skip bad input has to skip it rather than fail on it.
`Metric.produce` folds streaming increments before producers run, so a producer
only ever sees finished parts.

Both schemas are versioned, so a stored report stays readable when a field is
added or renamed: the report names its version and reading it runs the
migration. `View.produced(metric)` selects one metric's successful outputs from
a part stream. `View.metricTrajectory` reads a whole trajectory into parts that
carry the reports naming them, so a part can be shown beside the numbers
measured about it. Producing streams the reports; to keep them in the
trajectory, the declaration goes on the config's `metrickit` — a metric part
under a tag the config does not declare does not decode.

The measurements here are over tool results. Two results hold text, so two
reports come back: 16 characters from `grep` and 64 from `read_file`, 80 in all.
The third result is a PNG, so the producer reports `not-text` — the read says
what it could not measure instead of quietly leaving it out.

```sh
vp test tutorials/metric
```
