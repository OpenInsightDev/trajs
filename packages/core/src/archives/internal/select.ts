/**
 * A flag's two branches, judged where the flag is this type's own parameter: an
 * unknown flag — one the variant did not name — is both branches, so a part of an
 * unnamed variant is every part it could have been. The branch a `false` flag does
 * not select is left out by default.
 */
export type Select<Flag extends boolean, WhenTrue, WhenFalse = never> = Flag extends true
  ? WhenTrue
  : WhenFalse;
