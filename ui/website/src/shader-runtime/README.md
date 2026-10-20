# Vendored shader runtime

`@figma/expressive-components` is not published to npm — its README says to
`npm pack` it — so the files here are a copy of the parts the site draws shader
fills with, taken from
[figma/expressive-components](https://github.com/figma/expressive-components) at
commit `5b77f902fe203990ce720c1cf7475bf61859a296` (v0.1.0).

The site uses it because the hero's fills are authored shaders exported from
Figma, and this is the runtime those shaders are written against: `setup` and
`render` take a `CustomEffectState` whose `input`/`output`/`params`/`state` this
runtime supplies, so a shader module moves between Figma and the page
unchanged.

## What changed from upstream

Nothing in the drawing, the render loop or the device handling. Four mechanical
edits:

- `ShaderFill.tsx` starts with `"use client"`, because Waku renders the hero as
a server component and a component with hooks has to be in a client module.
- Relative imports lost their `.js` extension, which the package build wanted
and this app's TypeScript (`moduleResolution: bundler`) resolves without.
- The files sit flat rather than under `components/`.
- `ShaderEffect.tsx` and the `CustomEffect` alias are not included: the site
only draws fills, and `ShaderEffect` additionally needs HTML-in-Canvas. The
render loop in `useShaderRuntime.ts` is upstream's whole file, children branch
included, so adding it back is a copy rather than a merge.

Because they are copied sources rather than project code, this directory is in
the `fmt`/`lint` ignore lists in the repository's `vite.config.ts` — the same
treatment as the shadcn/ui components in `ui/shadcn/src`. Reformatting it would
break the only thing that makes it checkable against upstream, which is that it
is the same text.

## Licence

MIT, copyright © 2026 Figma, Inc. Reproduced as the licence requires:

> MIT License
>
> Copyright (c) 2026 Figma, Inc.
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
