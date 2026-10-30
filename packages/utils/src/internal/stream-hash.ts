/**
 * The digest a hash reads, as `StreamHash.make` derives it from the codec of a
 * platform.
 */

import { Sink } from "effect";
import { Hex } from "effect/encoding";

import {
  Algorithm,
  type Codec,
  type Hashing,
  type Options,
  defaultAlgorithm,
} from "#/StreamHash.ts";

/** The digest bytes of each algorithm. */
const bytesOf = (algorithm: Algorithm): number => {
  switch (algorithm) {
    case Algorithm.enums.Blake2b512:
      return 64;
    case Algorithm.enums.Sha256:
      return 32;
    case Algorithm.enums.Xxh64:
      return 8;
  }
};

/** The digest bytes of one call, and the algorithm they are read with. */
interface Reading {
  readonly algorithm: Algorithm;
  readonly bytes: number;
}

/**
 * A `length` outside the bytes of the algorithm raises a `RangeError` here, since
 * no digest of that length exists and the sink states no error.
 */
const reading = (options?: Options): Reading => {
  const algorithm = options?.algorithm ?? defaultAlgorithm;
  const bytes = bytesOf(algorithm);
  const length = options?.length ?? bytes;

  if (!Number.isInteger(length) || length < 1 || length > bytes) {
    throw new RangeError(`A digest reads 1 to ${bytes} bytes, and ${length} was stated.`);
  }

  return { algorithm, bytes: length };
};

/** The running digest of one algorithm, cut to the bytes a call reads. */
const cut = (hashing: Hashing, bytes: number): Hashing => ({
  digest: () => hashing.digest().subarray(0, bytes),
  update: (chunk) => {
    hashing.update(chunk);
  },
});

/** The sink of one stream, fed to one running digest of the codec. */
export const digestOf = (
  codec: Codec,
  options?: Options,
): Sink.Sink<string, Uint8Array, never, never> => {
  const { algorithm, bytes } = reading(options);

  return Sink.reduce(
    () => cut(codec.start(algorithm), bytes),
    (hashing: Hashing, chunk: Uint8Array) => {
      hashing.update(chunk);

      return hashing;
    },
  ).pipe(Sink.map((hashing) => Hex.encode(hashing.digest())));
};

/** The running digest of one call, cut to the bytes it reads. */
export const startOf = (codec: Codec, options?: Options): Hashing => {
  const { algorithm, bytes } = reading(options);

  return cut(codec.start(algorithm), bytes);
};
