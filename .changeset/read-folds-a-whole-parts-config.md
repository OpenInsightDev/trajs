---
"@trajs/core": minor
---

`Loaded.read` and `Loaded.readCached` fold a trajectory where the config they are given
states `stream` off. A trajectory is carried as the most general one — the increments a
streamed answer arrived in beside the whole parts they complete — so a config whose
response parts are whole was given parts its type said it could not hold. What is read
under such a config is now the folding of those increments into the parts they complete,
the folding `Metric.produce` reads a producer's trajectory with, so the parts a reading
yields are the ones its config states.
