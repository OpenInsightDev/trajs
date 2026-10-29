---
"@trajs/platform-browser": minor
---

`BrowserByteStore.layer` provides the `ByteStore` of `@trajs/utils` over the
`sessionStorage` of the tab. The chunks of a sequence are kept under the `trajs/`
prefix, so the bytes a page keeps outlive a reload of it and go with the tab, and
the entries the page writes into its own session storage share none of them.
