/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

// WebGPU's objects and its constant namespaces are declared by `@webgpu/types`.
// TypeScript's own DOM library carries the objects (`GPUDevice`, `GPUTexture`, …)
// but not `GPUBufferUsage` or `GPUTextureUsage`, which the hero's shader sets
// buffer usages with. The two declare the same interfaces; `skipLibCheck` is on in
// this app, so the duplication needs no reconciling.
