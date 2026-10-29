---
"@trajs/core": minor
---

`VersionedSchema` accepts fields and migrations that require services, and a read
now requires them. `VersionedSchema.make` no longer refuses a field whose decoding
needs a service, and `VersionedSchema.upgrade` takes the services its `decode`
getter requires, so a migration can read through one.

A kit that declares such a payload no longer refuses it. `Config.DecodingServices`
states what a read needs, and `Exchange.Service.load` and `Loaded.read` carry it to
the caller that reads the parts. Writing still encodes with the current schema, so
`Config.EncodingServices` states what a write needs.
