# Reading a trajectory with its metric results

A metric result can name the parts it is about. `View.metricTrajectory` reads a
whole trajectory into parts that carry those results, so a part is read beside
the numbers measured about it instead of in a second pass over a separate
stream.

```ts
const main = Effect.gen(function* () {
  const view = yield* View.metricTrajectory(trajectory);

  const parts = yield* view.pipe(Stream.runCollect);
});
```

The function takes a `Trajectory` and returns an `Effect` of a stream, because
the cache reads the trajectory to its end before the first part is emitted.
Provide `Cache.layer()` to keep the parts in memory, or `Cache.layerFsTemp()` to
spill them to a temporary directory. A finite trajectory is emitted in order
once it has been read; an infinite one never emits. The metric being read has to
be declared on the config's `metrickit`; a stored result under a tag the config
does not declare does not decode.

A part that is not a result leaves the view with `metrics`, a record from metric
tag to the results naming that part's uuid, each list in trajectory order. The
key is present only where a result named the part, so `part.metrics[metric.tag]`
is `undefined` elsewhere, and the payload narrows to that metric. A result with
`attach` leaves the stream and appears under every part it named. A result
without `attach` is about the run rather than a part, so it stays in the stream
as a `Metric` part.

An attachment names a part uuid. A result naming a uuid the trajectory does not
hold attaches to nothing, and because any result with `attach` leaves the stream,
an unmatched result is read nowhere. A target listed twice in one result
attaches once. A metric part belongs to the session of every part it names, so
`Session.stream` reads it beside those parts. The view reads the cached parts, so
the backing store has to remain available while the stream is consumed.

The run here has two turns that read a config file. To show each result's size
beside the result, a reader would otherwise keep the results in a second stream
and join them by uuid. The case measures the two results and writes their
results into the trajectory, with a run-wide total; the producer is the subject
of the [metric tutorial](../metric/README.md). `View.metricTrajectory` does the
join: 16 characters on the `grep` result, 64 on the `read_file` result, and the
80-character total as the only result left in the stream.

Run the case:

```sh
vp test metric-trajectory
```
