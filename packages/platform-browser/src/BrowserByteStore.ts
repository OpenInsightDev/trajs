/**
 * The chunks of a sequence in the session storage of a page.
 *
 * {@link layer} provides the `ByteStore` of `@trajs/utils` over the
 * `sessionStorage` of the tab, whose entries are the chunks and the record naming
 * them.
 *
 * @stability stable
 */

import * as ByteStore from "@trajs/utils/ByteStore";
import { Layer } from "effect";

import { layer as storeLayer } from "#/internal/key-value-store.ts";

/**
 * The store of bytes a page keeps: the chunks of a sequence in the session storage
 * of the tab.
 *
 * **When to use**
 *
 * Use where the bytes a page keeps are to outlive a reload of it, such as the parts
 * of a trajectory a viewer reads again. Use {@link ByteStore.layer} instead where
 * they are kept for as long as the page runs and no longer.
 *
 * **Details**
 *
 * It is {@link ByteStore.layerKVStore} over a key/value store of the
 * `sessionStorage` of the tab, so nothing else is required of a program.
 * A sequence is cut into chunks of `chunkSize` ({@link ByteStore.Options}), and a
 * chunk is kept as soon as it has arrived whole.
 *
 * The entries are kept under `trajs/`, so the entries the page writes into the same
 * storage are left alone.
 *
 * A tab keeps its session storage until it is closed, so what a page keeps is found
 * again when the page is reloaded or restored from the history.
 *
 * **Gotchas**
 *
 * A worker states no session storage, so the store is one of a page.
 *
 * A browser gives a tab a few megabytes of session storage, and a chunk is kept as
 * base64, which takes about a third more characters than its bytes. A write past
 * the quota fails as {@link ByteStore.ByteStoreError} rather than evicting a chunk
 * already kept.
 *
 * @see {@link ByteStore.Options} for how a sequence is cut as it is written.
 * @stability stable
 * @category layers
 */
export const layer = (options?: ByteStore.Options): Layer.Layer<ByteStore.ByteStore> =>
  ByteStore.layerKVStore(options).pipe(Layer.provide(storeLayer()));
