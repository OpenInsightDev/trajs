/**
 * A flag's two branches, judged where the flag is this type's own parameter: an
 * unknown flag — one the variant did not name — is both branches, so a part of an
 * unnamed variant is every part it could have been. The branch a `false` flag does
 * not select is left out by default.
 */
export type Select<Flag extends boolean, WhenTrue, WhenFalse = never> = Flag extends true
  ? WhenTrue
  : WhenFalse;

/**
 * Index an array of records by one of their keys — each key holding the record
 * that states it — and read a value that is not an array as it is given.
 *
 * The array is matched first because it states no key of the records it holds:
 * the records are what have to be read by one of theirs.
 */
export type IndexByKey<T, Key extends PropertyKey> =
  T extends ReadonlyArray<infer Item>
    ? {
        readonly [
          Value in Item extends Record<Key, infer Tag extends PropertyKey> ? Tag : never
        ]: Item extends Record<Key, Value> ? Item : never;
      }
    : { readonly [Name in keyof T]: T[Name] };
