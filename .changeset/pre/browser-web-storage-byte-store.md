---
"@trajs/platform-browser": minor
---

`BrowserByteStore.layerWebStorage` provides the `ByteStore` of `@trajs/utils` over the web
storage a program states, such as the `localStorage` of the page. The chunks of a sequence
are kept under the `trajs/` prefix, as `BrowserByteStore.layer` keeps them in the
`sessionStorage` of the tab, which is now that layer over `sessionStorage`.
