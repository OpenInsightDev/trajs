# @trajs/e2e

End-to-end integration tests across the packages of the workspace.

Where a package's own `tests/` exercises that package against the pieces it is
built over, these assemble a program out of several packages at once — the
`@trajs/core` exchange, the storage `@trajs/utils` ships, and the codecs a
platform package states — and exercise the seams between them. The package is
private: it states no exports and is not published.
