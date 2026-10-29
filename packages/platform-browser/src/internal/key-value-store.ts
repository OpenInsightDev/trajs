/**
 * A key/value store over the session storage of a page, as `BrowserByteStore.layer`
 * provides it.
 *
 * The entries are kept under a prefix, so a page that writes entries of its own into
 * the same storage shares none of them.
 */

import { Effect, Layer } from "effect";
import { KeyValueStore } from "effect/persistence";

const defaultPrefix = "trajs/";

/**
 * Reading and writing a `Storage` throw where the page withholds it, such as a
 * document whose site data is blocked, and where the quota of the tab is spent.
 */
const attempted = <A>(
  method: string,
  key: string | undefined,
  storage: () => A,
): Effect.Effect<A, KeyValueStore.KeyValueStoreError> =>
  Effect.try({
    try: storage,
    catch: (cause) =>
      new KeyValueStore.KeyValueStoreError({
        method,
        key,
        message:
          key === undefined
            ? `Unable to ${method} the store`
            : `Unable to ${method} the entry '${key}'`,
        cause,
      }),
  });

const entries = (storage: Storage, prefix: string): ReadonlyArray<string> => {
  const keys: Array<string> = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (key !== null && key.startsWith(prefix)) {
      keys.push(key);
    }
  }

  return keys;
};

/**
 * A binary value is kept as base64, since a `Storage` holds text alone, and is read
 * back as the bytes that were written.
 */
export const make = (storage: Storage, prefix = defaultPrefix): KeyValueStore.KeyValueStore =>
  KeyValueStore.makeStringOnly({
    get: (key) => attempted("get", key, () => storage.getItem(`${prefix}${key}`) ?? undefined),
    set: (key, value) =>
      attempted("set", key, () => {
        storage.setItem(`${prefix}${key}`, value);
      }),
    remove: (key) =>
      attempted("remove", key, () => {
        storage.removeItem(`${prefix}${key}`);
      }),
    clear: attempted("clear", undefined, () => {
      for (const key of entries(storage, prefix)) {
        storage.removeItem(key);
      }
    }),
    size: attempted("size", undefined, () => entries(storage, prefix).length),
  });

export const layer = (prefix = defaultPrefix): Layer.Layer<KeyValueStore.KeyValueStore> =>
  Layer.sync(KeyValueStore.KeyValueStore)(() => make(sessionStorage, prefix));
