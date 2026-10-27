# Case: metric-guided-investigation

An agent investigates a failing configuration test. The first run identifies an unset timeout. After the agent changes the default, the next run passes. A third run repeats the same passing check.

The analysis reads each test result as it arrives. It marks the failing run as `timeout-unset`, the first passing run as `tests-pass`, and a later passing run as `repeat`.

Three runs. The second one resolved the issue, and the third added nothing.

Run this case with:

```sh
vp test cases/metric-guided-investigation
```
