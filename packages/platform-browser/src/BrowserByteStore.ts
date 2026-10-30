/**
 * The chunks of a sequence in a web storage of a page.
 *
 * {@link layerWebStorage} provides the `ByteStore` of `@trajs/utils` over a storage of
 * the page, and {@link layer} over the `sessionStorage` of the tab. The entries of
 * either are the chunks and the record naming them.
 *
 * @stability stable
 */

import * as ByteStore from "@trajs/utils/ByteStore";
import { Layer } from "effect";

import { layer as storeLayer } from "#/internal/key-value-store.ts";

/**
 * The store of bytes a page keeps in the web storage `storage` names: the chunks of a
 * sequence in its entries.
 *
 * **When to use**
 *
 * Use where the bytes are to be found by every tab of the origin and to outlive them,
 * such as a setting a viewer states once.
 *
 * **Details**
 *
 * It is {@link ByteStore.layerKVStore} over a key/value store of `storage`, so nothing
 * else is required of a program.
 * A sequence is cut into chunks of `chunkSize` ({@link ByteStore.Options}), and a chunk
 * is kept as soon as it has arrived whole.
 *
 * The entries are kept under `trajs/`, so the entries the page writes into the same
 * storage are left alone.
 *
 * **Gotchas**
 *
 * `localStorage`, the storage this is usually given, is shared by every tab of the
 * origin, so a sequence one tab keeps is found by the next, and an id two tabs write is
 * one sequence.
 *
 * A browser gives an origin a few megabytes of it, and a chunk is kept as base64, which
 * takes about a third more characters than its bytes. A write past the quota fails as
 * {@link ByteStore.ByteStoreError} rather than evicting a chunk already kept.
 *
 * @see {@link layer} for the same store over the session storage of the tab.
 * @see {@link ByteStore.Options} for how a sequence is cut as it is written.
 * @stability stable
 * @category layers
 */
export const layerWebStorage = (
  storage: Storage,
  options?: ByteStore.Options,
): Layer.Layer<ByteStore.ByteStore> =>
  ByteStore.layerKVStore(options).pipe(Layer.provide(storeLayer(storage)));

/**
 * The store of bytes a page keeps: the chunks of a sequence in the session storage of
 * the tab.
 *
 * **When to use**
 *
 * Use where the bytes a page keeps are to outlive a reload of it, such as the parts of
 * a trajectory a viewer reads again. Use {@link ByteStore.layer} instead where they are
 * kept for as long as the page runs and no longer.
 *
 * **Details**
 *
 * It is {@link layerWebStorage} over `sessionStorage`, so nothing else is required of a
 * program.
 *
 * A tab keeps its session storage until it is closed, so what a page keeps is found
 * again when the page is reloaded or restored from the history.
 *
 * **Gotchas**
 *
 * A worker states no session storage, so the store is one of a page. `layer` reads
 * `sessionStorage` where it is stated, so a worker that states it fails there.
 *
 * A browser gives a tab a few megabytes of session storage, and a chunk is kept as
 * base64, which takes about a third more characters than its bytes. A write past the
 * quota fails as {@link ByteStore.ByteStoreError} rather than evicting a chunk already
 * kept.
 *
 * @see {@link layerWebStorage} for the same store over a storage a program states.
 * @see {@link ByteStore.Options} for how a sequence is cut as it is written.
 * @stability stable
 * @category layers
 */
export const layer = (options?: ByteStore.Options): Layer.Layer<ByteStore.ByteStore> =>
  layerWebStorage(sessionStorage, options);
