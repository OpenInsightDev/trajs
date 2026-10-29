---
"@trajs/core": minor
---

A metric result attaches to parts: `Metric.Output.attach` and `Metric.Failure.attach`
name part uuids and nothing else. A metric part states no session of its own, so it
belongs to the session of every part it names. Session membership is read from what
the result measured rather than stated beside it, which drops the second meaning a
result's attachments used to carry.

`Session.stream` therefore reads a metric part in the sessions of the parts it names.
A result naming a session declaration is read in the session that declaration
declares, since a declaration belongs to the session it declares. A result naming a
session id is now read in no session, where it used to be read in the session it
named.

`View.metricTrajectory` is unchanged: it has always matched part uuids only, so a
result naming a session id already attached to nothing there.
