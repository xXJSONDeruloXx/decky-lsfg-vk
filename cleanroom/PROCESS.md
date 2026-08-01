# Clean-room shader reimplementation process

Goal: replace the 51 runtime-traced SPIR-V shaders that were embedded in
`src/shaders_embedded.hpp` with independently written GLSL, compiled with our
own toolchain (glslc, NDK 27.3), so the shipped layer contains no third-party
compiled artifacts.

Scope: this reimplements the shader **code**. The numeric weight constants of
the networks are carried over from the originals as functional parameters, so
the result reproduces their behavior bit-exactly. Reimplementing those from
scratch would mean retraining the networks; the specifications document their
architecture in enough detail to do so.

## Separation

Two roles, never combined in one actor:

- **Specification team** ("dirty"): reads the disassembled originals
  (spirv-dis output, kept outside this repository) and produces the functional
  specifications in `specs/`. Specifications describe observable behavior:
  descriptor interface, workgroup dimensions, the mathematics computed, and the
  weight tables. They contain no code, no structure, and no naming from the
  originals (the originals are stripped SPIR-V; they contain no names to copy).
  Constants are extracted mechanically and machine-verified to round-trip
  exactly through fp16.
- **Implementation team** ("clean"): receives the specification files and
  previously written clean GLSL as style reference, and is instructed not to
  consult the originals or their disassembly — writing original GLSL from the
  spec alone. Each shader is compiled with glslc and validated against the
  layer's pipeline interface.

Both roles were performed by AI agents in separate contexts: the implementing
agents' inputs contained the specification text and GLSL authoring conventions
only. The separation is procedural — enforced by the agents' instructions and
inputs, not by a technical barrier.

## Validation

- `glslc` compile + `spirv-val`.
- Interface check: bindings, storage image formats, and workgroup sizes are
  verified mechanically against the spec by the build script.
- On-device A/B against the traced pipeline (visual parity + telemetry) before
  the traced set is removed. Both models were verified on device: identical
  graph shape and pass counts, equivalent frame pacing and throughput, and
  motion-responsive flow telemetry.

## Layout

- `specs/NN[-family].md` — functional specs (one per shader family; family
  members differ only by listed parameters)
- `glsl/shader_NN.comp` — clean implementations, one per shader index
- `build_embedded.py` — compiles glsl/ and regenerates the embedded header
