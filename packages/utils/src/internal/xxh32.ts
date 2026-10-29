/**
 * The XXH32 digest of a byte sequence, fed to it a chunk at a time, as
 * `StreamHash.make` provides it.
 *
 * `@noble/hashes` states no xxHash, so this package carries the algorithm. The
 * digest of XXH32 is its 32-bit value, written as four bytes big-endian.
 */

/** The primes of the algorithm, under the names the reference implementation gives them. */
const Prime1 = 0x9e3779b1;
const Prime2 = 0x85ebca77;
const Prime3 = 0xc2b2ae3d;
const Prime4 = 0x27d4eb2f;
const Prime5 = 0x165667b1;

/** The bytes one stripe holds. */
const Stripe = 16;

/** The bytes one word holds. */
const Word = 4;

/** The seed of every digest here, which is XXH32 of the bytes as they are. */
const Seed = 0;

const rotateLeft = (word: number, bits: number): number =>
  ((word << bits) | (word >>> (32 - bits))) >>> 0;

/** One round of a lane over one word of a stripe. */
const round = (accumulator: number, word: number): number =>
  Math.imul(rotateLeft((accumulator + Math.imul(word, Prime2)) >>> 0, 13), Prime1) >>> 0;

/** One whole word of the tail. */
const tailWord = (accumulator: number, word: number): number =>
  Math.imul(rotateLeft((accumulator + Math.imul(word, Prime3)) >>> 0, 17), Prime4) >>> 0;

/** One byte of the tail that a word does not hold. */
const tailByte = (accumulator: number, byte: number): number =>
  Math.imul(rotateLeft((accumulator + Math.imul(byte, Prime5)) >>> 0, 11), Prime1) >>> 0;

/**
 * Begins the digest of a byte sequence.
 */
export const create = () => {
  const lanes = new Uint32Array([
    (Seed + Prime1 + Prime2) >>> 0,
    (Seed + Prime2) >>> 0,
    Seed >>> 0,
    (Seed - Prime1) >>> 0,
  ]);

  // A chunk rarely ends on a stripe boundary, so the bytes of a stripe not yet
  // whole wait here with the tail that follows the last whole one.
  const held = new Uint8Array(Stripe);
  const heldWords = new DataView(held.buffer);

  let filled = 0;
  let length = 0;

  const stripe = (view: DataView, at: number): void => {
    lanes[0] = round(lanes[0], view.getUint32(at, true));
    lanes[1] = round(lanes[1], view.getUint32(at + Word, true));
    lanes[2] = round(lanes[2], view.getUint32(at + 2 * Word, true));
    lanes[3] = round(lanes[3], view.getUint32(at + 3 * Word, true));
  };

  const update = (bytes: Uint8Array): void => {
    length += bytes.length;

    let at = 0;

    if (filled > 0) {
      const taken = Math.min(Stripe - filled, bytes.length);

      held.set(bytes.subarray(0, taken), filled);
      filled += taken;
      at = taken;

      if (filled < Stripe) {
        return;
      }

      stripe(heldWords, 0);
      filled = 0;
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    while (bytes.length - at >= Stripe) {
      stripe(view, at);
      at += Stripe;
    }

    if (at < bytes.length) {
      held.set(bytes.subarray(at), 0);
      filled = bytes.length - at;
    }
  };

  const digest = (): Uint8Array => {
    // XXH32 adds the lanes as rotations. XXH64 is the one that merges them.
    const lanesRead =
      length >= Stripe
        ? rotateLeft(lanes[0], 1) +
          rotateLeft(lanes[1], 7) +
          rotateLeft(lanes[2], 12) +
          rotateLeft(lanes[3], 18)
        : Seed + Prime5;

    let hash = (lanesRead + length) >>> 0;
    let at = 0;

    for (; at + Word <= filled; at += Word) {
      hash = tailWord(hash, heldWords.getUint32(at, true));
    }

    for (; at < filled; at += 1) {
      hash = tailByte(hash, held[at]);
    }

    hash ^= hash >>> 15;
    hash = Math.imul(hash, Prime2) >>> 0;
    hash ^= hash >>> 13;
    hash = Math.imul(hash, Prime3) >>> 0;
    hash ^= hash >>> 16;

    const bytes = new Uint8Array(Word);

    new DataView(bytes.buffer).setUint32(0, hash);

    return bytes;
  };

  return { digest, update };
};
