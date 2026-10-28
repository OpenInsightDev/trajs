# @trajs/olap

## 0.0.0-alpha.3

### Minor Changes

- [`ee63541`](https://github.com/trajs-ai/trajs/commit/ee63541a46099f4daa98a1e0786f4283d7dacc94) Thanks [@observerw](https://github.com/observerw)! - `Parts.rows` states a part as its canonical JSON form rather than as the exchange
  encodes it, so a `Uint8Array` in a payload is the base64 string JSON states it
  as rather than an object of a key per byte, and a `bigint` is its decimal string.
  An image of 1024 bytes used to write 1024 paths into the `part` `JSON` column and
  now writes one.
  
  `Parts.Encoded` is `Schema.JsonObject` and no longer takes the config, since
  canonical JSON does not depend on the kits. A value of the part's schema that is
  `unknown`, such as a param of a tool no toolkit declares, must already be JSON: a
  part carrying one that is not fails to encode instead of writing a payload the
  `JSON` column cannot hold.

### Patch Changes

- Updated dependencies [[`8de6038`](https://github.com/trajs-ai/trajs/commit/8de60386eccdf99d6f78e5f1a4a050ea79213eba), [`3e3e067`](https://github.com/trajs-ai/trajs/commit/3e3e067f32cefa803c1319f19a8a6950602bdb10), [`12d903e`](https://github.com/trajs-ai/trajs/commit/12d903e5530ecbe3f82d88e7c727f4154683effd), [`588a346`](https://github.com/trajs-ai/trajs/commit/588a346a760d1223dab6a806946d8deb2244dc11), [`84d8f95`](https://github.com/trajs-ai/trajs/commit/84d8f9520baa5f6bc4772a69d41958367b412ad4), [`aeb37a1`](https://github.com/trajs-ai/trajs/commit/aeb37a1f3aef831494199b135f1dc1084829b9b3), [`588a346`](https://github.com/trajs-ai/trajs/commit/588a346a760d1223dab6a806946d8deb2244dc11)]:
  - @trajs/core@0.0.0-alpha.3

## 0.0.0-alpha.2

### Patch Changes

- Updated dependencies [[`6c8f6cb`](https://github.com/trajs-ai/trajs/commit/6c8f6cb6aa7f65dd70f8fdeb09bfb103ec82c679)]:
  - @trajs/core@0.0.0-alpha.2

## 0.0.0-alpha.1

### Patch Changes

- [`eb0faec`](https://github.com/trajs-ai/trajs/commit/eb0faec9944c344eabe9e32f19a7507b821e53ad) Thanks [@observerw](https://github.com/observerw)! - Release the core libraries under `packages/` as `0.0.0-alpha.1`. They are one
  Changesets `fixed` group and share that version: `@trajs/core`, `@trajs/olap`,
  `@trajs/platform-browser`, `@trajs/platform-bun`, `@trajs/platform-node` and
  `@trajs/utils`.
- Updated dependencies [[`eb0faec`](https://github.com/trajs-ai/trajs/commit/eb0faec9944c344eabe9e32f19a7507b821e53ad)]:
  - @trajs/core@0.0.0-alpha.1
