/**
 * The type-level side of the producers a set of extensions takes, which the public
 * `Extensionkit.withProducers` checks a record of against the set.
 */

/**
 * The identifiers a record gives that a set does not hold.
 *
 * Nothing can be given for one: the set is what a producer is read off, so a
 * producer under an identifier no extension of the set has is never run. The value
 * type is what the compiler reports for such a key.
 */
export type Unheld<Exts, P> = {
  readonly [Id in Exclude<keyof P, keyof Exts>]: "no extension of the set has that identifier";
};
