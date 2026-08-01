# shader_18 — 3x3 stride-1 convolution, 8 -> 8 channels (shared-memory tiled, sampler reads)

Source of truth: `shader_18.dis` (spirv-dis output, kept outside this
repository). One compute pass. It computes **exactly the same kind of
result** as shader_16 (`16-conv3x3-8to8.md`) — a fixed fp16 3x3 stride-1
convolution, 8 in-channels (two sampled RGBA images) to 8 out-channels (two
RGBA8 storage images), followed by a per-channel affine remap — but with a
**different load architecture and different boundary semantics**:

- The workgroup first cooperatively loads an **18 x 18 texel tile** (the
  16 x 16 output block plus a 1-texel apron) of each input into two shared-
  memory arrays of `f16vec4`, then barriers, then every invocation takes
  its 9 taps per input from shared memory.
- Loads are **sampler-based** (`textureLod` with normalized UVs at LOD 0),
  not `texelFetch`; there is **no shader-side zero padding** — out-of-range
  apron coordinates resolve to whatever the bound sampler's addressing mode
  returns (see §4). Sampler state is therefore behaviorally relevant, unlike
  shaders 15/16.
- There is **no early return**: every invocation participates in the tile
  load and the barrier; only the two image writes are guarded.

There is no UBO, no push constants, no spec constants.

## 1. Interface

- Workgroup size: **16 x 16 x 1**.
- Built-ins: `gl_GlobalInvocationID` (`.xy`), `gl_LocalInvocationID`
  (`.xy`), `gl_WorkGroupID` (`.xy`), `gl_LocalInvocationIndex`.
- Shared memory: two workgroup arrays, each `f16vec4[18][18]`
  (tileA for binding 32, tileB for binding 33) — 2 x 18 x 18 x 8 = 5184
  bytes total.
- All descriptors in **set 0**. The table lists what the shader itself
  declares; a host descriptor-set layout may legally declare additional
  bindings (e.g. sampled 34/35 or storage 50/51) that the shader never
  touches.

| binding | kind | format | access | role |
|---|---|---|---|---|
| 32 | combined image sampler, 2D float | (sampled; format external) | read (textureLod) | input feature image 0 — taps 0-8; also the size used for UV normalization |
| 33 | combined image sampler, 2D float | (sampled; format external) | read (textureLod) | input feature image 1 — taps 9-17 |
| 48 | storage image 2D | `rgba8` | write-only (`NonReadable`) | output channels 0-3; its size is the bounds-check extent |
| 49 | storage image 2D | `rgba8` | write-only (`NonReadable`) | output channels 4-7 |

## 2. Behavior

Notation:

```
p       = ivec2(gl_GlobalInvocationID.xy)   // output texel (unsigned bitcast to signed)
outSize = imageSize(out48)                  // binding 48 only
lid     = gl_LocalInvocationID.xy           // 0..15 each
base    = ivec2(gl_WorkGroupID.xy) * 16     // workgroup's output-block origin
inSize  = vec2(textureSize(in32, 0))        // binding 32 only
invSize = vec2(1.0) / inSize                // computed once, fp32 division
ok      = !(p.x >= outSize.x || p.y >= outSize.y)   // signed compare; write guard
```

`ok` is evaluated **before** the tile load; there is no early return — the
load loop and barrier below execute in every invocation (required for the
barrier to be reached uniformly).

### 2.1 Cooperative tile load

The 18 x 18 tile covers input texels `base + (i, j) - (1, 1)` for
`i, j = 0..17` (i.e. `base-1 .. base+16` on each axis: the output block plus
a 1-texel apron). The 324 tile cells are distributed over the 256
invocations by a strided loop over `gl_LocalInvocationIndex`:

```
for (idx = gl_LocalInvocationIndex; idx < 324; idx += 256) {
    i  = idx % 18;  j = idx / 18;                    // unsigned mod/div
    c  = base + ivec2(int(i), int(j)) - ivec2(1);    // input texel
    uv = (vec2(c) + 0.5) * invSize;                  // fp32; normalized by in32's size
    tileA[i][j] = f16vec4(textureLod(in32, uv, 0.0));
    tileB[i][j] = f16vec4(textureLod(in33, uv, 0.0));
}
barrier();   // workgroup control barrier, workgroup-memory acquire/release
```

- Each invocation therefore loads one or (for
  `gl_LocalInvocationIndex < 68`) two cells of each tile.
- **Both** inputs are sampled at the same `uv`, normalized by binding 32's
  level-0 size (the shader assumes the two inputs share that size — a
  different-sized in33 would be sampled at proportionally scaled
  coordinates).
- Sample results convert fp32 -> fp16 at tile-store time; all subsequent
  math reads fp16 from shared memory.

### 2.2 Taps

After the barrier, each invocation reads its 3x3 neighborhoods entirely
from shared memory. With `D[k], k = 0..8 : (-1,-1), (-1,0), (-1,1), (0,-1),
(0,0), (0,1), (1,-1), (1,0), (1,1)` (same canonical (dx, dy) order as the
sibling conv shaders), and noting `tileX[lid.x + dx + 1][lid.y + dy + 1]`
holds the value for input texel `p + (dx, dy)`:

```
t[0 + k] (f16vec4) = tileA[lid.x + D[k].x + 1][lid.y + D[k].y + 1]   k = 0..8
t[9 + k] (f16vec4) = tileB[lid.x + D[k].x + 1][lid.y + D[k].y + 1]   k = 0..8
```

All 18 shared-memory reads happen unconditionally (also in invocations that
will not write).

### 2.3 Per output image

For each output `o` in {48, 49} the shader bakes in 18 `f16mat4` matrices
`W[o][j]` (one per tap) and 3 `f16vec4` affine constants `a[o]`, `m[o]`,
`b[o]`. Each output is computed and stored **only if `ok`** (each store has
its own guard on the same `ok` condition):

```
sum = W[o][0]*t[0] + W[o][1]*t[1] + ... + W[o][17]*t[17]    // f16vec4
v   = (sum - a[o]) * m[o] + b[o]                            // componentwise fp16
imageStore(out_o, p, vec4(v))                               // rgba8 unorm store
```

- Matrices are given **by column** in the appendix:
  `W*t = col0*t.x + col1*t.y + col2*t.z + col3*t.w` — i.e. a GLSL
  `f16mat4(col0, col1, col2, col3) * t`.
- All arithmetic is IEEE fp16. The 18 terms of each output's sum associate
  **strictly left-to-right in ascending tap order j = 0..17**
  (input binding 32 then 33; within each input, offset order D[0]..D[8]).
  Verified mechanically for both (shader, output) chains: each add chain is
  left-deep and in ascending canonical order. Reproduce this order for
  bit-exactness.
- The `rgba8` store clamps each component to [0,1] and quantizes to unorm8;
  this clamp is the only nonlinearity in the pass.

Both outputs are written at the same `p` from the same 18 taps; they differ
only in their constants.

Interpretation (hint, not normative): the model-0 (narrow, 8-channel)
counterpart of model-1 shader_42 — the next 3x3 conv layer of the same
refinement-round stack; consumes shader_16's two outputs. The tile is a
conventional shared-memory optimization of the same convolution.

## 3. Control flow

- No early return. One loop (the strided tile-load loop of §2.1, 1-2
  iterations per invocation), one workgroup barrier after it.
- Two independent store guards on `ok` (§2.3), one per output image; taps,
  products and everything else are unconditional.
- No other conditionals.

## 4. Boundary behavior

- The shader performs **no clamping and no zero padding**. Apron cells at
  image edges (and all cells of fully overhanging workgroups) produce UVs
  outside [0, 1]; what they read is determined by the **bound sampler's
  addressing mode** (e.g. clamp-to-edge replicates the border texel). This
  is the key observable difference from shaders 15/16, whose out-of-range
  taps are exactly zero: along image borders the two architectures
  legitimately differ unless the sampler is border-clamped to zero.
- Reads use normalized UVs at explicit LOD 0 through the runtime sampler;
  with a linear filter, `(vec2(c) + 0.5) * invSize` lands on exact texel
  centers of in32, so filtering does not blend texels of a same-sized
  input. (A nearest filter gives the same result; an in33 sized differently
  from in32 would be sampled off-center at scaled coordinates.)
- Writes are guarded only against binding 48's size; output 49 is assumed
  at least as large.
- Dispatch is expected to cover `outSize` (ceil(outSize/16) workgroups per
  axis); overhanging invocations still load and barrier, then skip both
  stores.

## 5. Precision requirements

- UV arithmetic (`+0.5`, reciprocal-of-size multiply) is fp32; the
  reciprocal is computed once as `vec2(1.0) / inSize` and multiplied, not
  divided per cell.
- fp32 sample results convert to fp16 (round-to-nearest-even) when stored
  to the tile, before any weight math.
- All weight/add/affine math in IEEE fp16
  (`GL_EXT_shader_explicit_arithmetic_types_float16`); no contraction
  decorations present — use the association order of §2.3.
- Final result converts fp16 -> fp32, then unorm8 store.

## 6. Constants

All fp16 constants below were **machine-extracted** from the disassembly by
a parser that follows the dataflow from each store back through the affine
remap and the add chain (mapping every constant to its role by use, not by
position in the file), and cross-checked: all **584** fp16 constants
declared in the module are referenced by exactly the tables below (584/584;
none unreferenced, none missing), for **600** table entries total
(2 outputs x (18 matrices x 16 + 3 affine x 4); the module deduplicates
repeated values). Every value round-trips IEEE binary16 exactly. Values are
written `decimal(hexfloat)` — both forms denote the identical binary16
value. `affine_sub/mul/add` = `a/m/b` of §2.3; `inNN tap(dx,dy)` keys give
`W[o][j]` as 4 columns.

---

# Appendix — shader_18 constants

#### output binding 48
- affine_sub: [-1.236328125(-0x1.3c8p+0), -2.08984375(-0x1.0b8p+1), -1.537109375(-0x1.898p+0), -1.7275390625(-0x1.ba4p+0)]
- affine_mul: [0.27978515625(0x1.1e8p-2), 0.425537109375(0x1.b3cp-2), 0.269775390625(0x1.144p-2), 0.3212890625(0x1.49p-2)]
- affine_add: [-0.00743865966796875(-0x1.e78p-8), -0.3701171875(-0x1.7bp-2), 0.03558349609375(0x1.238p-5), 0.0161285400390625(0x1.084p-6)]
- in32 tap(-1,-1): cols [0.425048828125(0x1.b34p-2), 0.1304931640625(0x1.0b4p-3), 0.52783203125(0x1.0e4p-1), -0.8291015625(-0x1.a88p-1)] ; [0.26416015625(0x1.0e8p-2), 0.298828125(0x1.32p-2), -0.01415252685546875(-0x1.cfcp-7), 0.41552734375(0x1.a98p-2)] ; [0.51611328125(0x1.084p-1), 0.0867919921875(0x1.638p-4), -0.53125(-0x1.1p-1), -1.146484375(-0x1.258p+0)] ; [-0.0283203125(-0x1.dp-6), 0.0047149658203125(0x1.35p-8), 0.34814453125(0x1.648p-2), 0.0169830322265625(0x1.164p-6)]
- in32 tap(-1,+0): cols [0.2247314453125(0x1.cc4p-3), -0.50830078125(-0x1.044p-1), -0.00595855712890625(-0x1.868p-8), -0.353271484375(-0x1.69cp-2)] ; [0.2054443359375(0x1.a4cp-3), 0.24560546875(0x1.f7p-3), 0.05487060546875(0x1.c18p-5), 0.3046875(0x1.38p-2)] ; [0.06304931640625(0x1.024p-4), -0.173828125(-0x1.64p-3), 0.004367828369140625(0x1.1e4p-8), -0.7705078125(-0x1.8a8p-1)] ; [-0.1148681640625(-0x1.d68p-4), -0.089599609375(-0x1.6fp-4), 0.30859375(0x1.3cp-2), -0.06756591796875(-0x1.14cp-4)]
- in32 tap(-1,+1): cols [0.43017578125(0x1.b88p-2), -0.0364990234375(-0x1.2bp-5), 0.484375(0x1.fp-2), -0.8349609375(-0x1.ab8p-1)] ; [0.2607421875(0x1.0bp-2), 0.2471923828125(0x1.fa4p-3), 0.07904052734375(0x1.43cp-4), 0.41748046875(0x1.ab8p-2)] ; [0.58642578125(0x1.2c4p-1), 0.13818359375(0x1.1bp-3), -0.6015625(-0x1.34p-1), -1.404296875(-0x1.678p+0)] ; [-0.0238800048828125(-0x1.874p-6), 0.1046142578125(0x1.ac8p-4), 0.54052734375(0x1.14cp-1), 0.07122802734375(0x1.23cp-4)]
- in32 tap(+0,-1): cols [0.0989990234375(0x1.958p-4), -0.2239990234375(-0x1.cacp-3), 0.0218963623046875(0x1.66cp-6), -0.1861572265625(-0x1.7d4p-3)] ; [0.300537109375(0x1.33cp-2), 0.30029296875(0x1.338p-2), -0.052825927734375(-0x1.b0cp-5), 0.376953125(0x1.82p-2)] ; [-0.005107879638671875(-0x1.4ecp-8), -0.56591796875(-0x1.21cp-1), -0.4892578125(-0x1.f5p-2), -0.28466796875(-0x1.238p-2)] ; [0.0943603515625(0x1.828p-4), 0.1649169921875(0x1.51cp-3), 0.1263427734375(0x1.02cp-3), 0.01561737060546875(0x1.ffcp-7)]
- in32 tap(+0,+0): cols [-0.1351318359375(-0x1.14cp-3), -0.55126953125(-0x1.1a4p-1), -0.406982421875(-0x1.a0cp-2), 0.383544921875(0x1.88cp-2)] ; [0.274169921875(0x1.18cp-2), 0.2210693359375(0x1.c4cp-3), -0.0287628173828125(-0x1.d74p-6), 0.20703125(0x1.a8p-3)] ; [-0.346435546875(-0x1.62cp-2), -0.71875(-0x1.7p-1), 0.12408447265625(0x1.fc4p-4), 0.74365234375(0x1.7ccp-1)] ; [-0.01308441162109375(-0x1.accp-7), 0.143798828125(0x1.268p-3), 0.1329345703125(0x1.104p-3), -0.0352783203125(-0x1.21p-5)]
- in32 tap(+0,+1): cols [0.1588134765625(0x1.454p-3), -0.291748046875(-0x1.2acp-2), 0.009674072265625(0x1.3dp-7), -0.29443359375(-0x1.2d8p-2)] ; [0.305908203125(0x1.394p-2), 0.26611328125(0x1.108p-2), -0.020751953125(-0x1.54p-6), 0.364501953125(0x1.754p-2)] ; [0.0948486328125(0x1.848p-4), -0.45458984375(-0x1.d18p-2), -0.578125(-0x1.28p-1), -0.2470703125(-0x1.fap-3)] ; [0.1065673828125(0x1.b48p-4), 0.2022705078125(0x1.9e4p-3), 0.44384765625(0x1.c68p-2), 0.1009521484375(0x1.9d8p-4)]
- in32 tap(+1,-1): cols [0.3515625(0x1.68p-2), 0.128173828125(0x1.068p-3), 0.41357421875(0x1.a78p-2), -0.43603515625(-0x1.be8p-2)] ; [0.343505859375(0x1.5fcp-2), 0.169921875(0x1.5cp-3), 0.0305633544921875(0x1.f4cp-6), 0.31103515625(0x1.3e8p-2)] ; [0.48779296875(0x1.f38p-2), -0.045562744140625(-0x1.754p-5), -0.78369140625(-0x1.914p-1), -1.3173828125(-0x1.514p+0)] ; [0.031524658203125(0x1.024p-5), -0.131591796875(-0x1.0d8p-3), 0.35498046875(0x1.6b8p-2), -0.0310516357421875(-0x1.fccp-6)]
- in32 tap(+1,+0): cols [0.0596923828125(0x1.e9p-5), -0.369140625(-0x1.7ap-2), 0.094970703125(0x1.85p-4), -0.2318115234375(-0x1.dacp-3)] ; [0.361572265625(0x1.724p-2), 0.2041015625(0x1.a2p-3), 0.01080322265625(0x1.62p-7), 0.1339111328125(0x1.124p-3)] ; [0.07025146484375(0x1.1fcp-4), -0.307861328125(-0x1.3b4p-2), -0.1429443359375(-0x1.24cp-3), -0.740234375(-0x1.7bp-1)] ; [-0.052337646484375(-0x1.accp-5), -0.1168212890625(-0x1.de8p-4), 0.302001953125(0x1.354p-2), -0.133544921875(-0x1.118p-3)]
- in32 tap(+1,+1): cols [0.20947265625(0x1.adp-3), -0.060333251953125(-0x1.ee4p-5), 0.31103515625(0x1.3e8p-2), -0.83740234375(-0x1.accp-1)] ; [0.343994140625(0x1.604p-2), 0.197509765625(0x1.948p-3), 0.038848876953125(0x1.3e4p-5), 0.2498779296875(0x1.ffcp-3)] ; [0.466796875(0x1.dep-2), 0.1265869140625(0x1.034p-3), -0.7568359375(-0x1.838p-1), -1.185546875(-0x1.2f8p+0)] ; [-0.00487518310546875(-0x1.3f8p-8), -0.142822265625(-0x1.248p-3), 0.51611328125(0x1.084p-1), 0.0270538330078125(0x1.bb4p-6)]
- in33 tap(-1,-1): cols [-0.2293701171875(-0x1.d5cp-3), -0.1016845703125(-0x1.a08p-4), -0.396240234375(-0x1.95cp-2), -0.359375(-0x1.7p-2)] ; [-0.55517578125(-0x1.1c4p-1), -0.6572265625(-0x1.508p-1), -1.1611328125(-0x1.294p+0), 0.169189453125(0x1.5a8p-3)] ; [-0.99267578125(-0x1.fc4p-1), -0.900390625(-0x1.cdp-1), 0.2481689453125(0x1.fc4p-3), 0.348876953125(0x1.654p-2)] ; [-0.2259521484375(-0x1.cecp-3), -0.1431884765625(-0x1.254p-3), 0.51025390625(0x1.054p-1), 0.022918701171875(0x1.778p-6)]
- in33 tap(-1,+0): cols [0.027496337890625(0x1.c28p-6), 0.0090789794921875(0x1.298p-7), -0.1839599609375(-0x1.78cp-3), 0.033203125(0x1.1p-5)] ; [-0.1949462890625(-0x1.8f4p-3), -0.0270538330078125(-0x1.bb4p-6), -0.28759765625(-0x1.268p-2), 0.01018524169921875(0x1.4dcp-7)] ; [-0.880859375(-0x1.c3p-1), -0.697265625(-0x1.65p-1), -0.018463134765625(-0x1.2e8p-6), -0.01084136962890625(-0x1.634p-7)] ; [-0.242919921875(-0x1.f18p-3), 0.017791748046875(0x1.238p-6), -0.047698974609375(-0x1.86cp-5), 0.0016689300537109375(0x1.b58p-10)]
- in33 tap(-1,+1): cols [-0.296142578125(-0x1.2f4p-2), -0.169677734375(-0x1.5b8p-3), -0.360595703125(-0x1.714p-2), -0.45361328125(-0x1.d08p-2)] ; [-0.356201171875(-0x1.6ccp-2), -0.6875(-0x1.6p-1), -1.212890625(-0x1.368p+0), 0.2188720703125(0x1.c04p-3)] ; [-1.455078125(-0x1.748p+0), -1.1630859375(-0x1.29cp+0), 0.1204833984375(0x1.ed8p-4), 0.356201171875(0x1.6ccp-2)] ; [-0.25(-0x1p-2), -0.1573486328125(-0x1.424p-3), 0.3291015625(0x1.51p-2), -0.1319580078125(-0x1.0e4p-3)]
- in33 tap(+0,-1): cols [-0.1485595703125(-0x1.304p-3), -0.129150390625(-0x1.088p-3), -0.1351318359375(-0x1.14cp-3), -0.07147216796875(-0x1.24cp-4)] ; [-0.1820068359375(-0x1.74cp-3), -0.56005859375(-0x1.1ecp-1), -0.53369140625(-0x1.114p-1), -0.049774169921875(-0x1.97cp-5)] ; [-0.31298828125(-0x1.408p-2), -0.29638671875(-0x1.2f8p-2), 0.0193023681640625(0x1.3c4p-6), -0.0250701904296875(-0x1.9acp-6)] ; [0.039459228515625(0x1.434p-5), -0.11126708984375(-0x1.c7cp-4), 0.07830810546875(0x1.40cp-4), 0.0227203369140625(0x1.744p-6)]
- in33 tap(+0,+0): cols [0.2227783203125(0x1.c84p-3), 0.1116943359375(0x1.c98p-4), 0.2027587890625(0x1.9f4p-3), 0.2568359375(0x1.07p-2)] ; [0.1744384765625(0x1.654p-3), 0.273193359375(0x1.17cp-2), 0.6884765625(0x1.608p-1), -0.16015625(-0x1.48p-3)] ; [0.53271484375(0x1.10cp-1), 0.1326904296875(0x1.0fcp-3), -0.183837890625(-0x1.788p-3), -0.21728515625(-0x1.bdp-3)] ; [0.1214599609375(0x1.f18p-4), 0.0220947265625(0x1.6ap-6), -0.365966796875(-0x1.76cp-2), 0.0599365234375(0x1.ebp-5)]
- in33 tap(+0,+1): cols [-0.1910400390625(-0x1.874p-3), -0.1439208984375(-0x1.26cp-3), 0.08990478515625(0x1.704p-4), 0.0052490234375(0x1.58p-8)] ; [-0.297607421875(-0x1.30cp-2), -0.55419921875(-0x1.1bcp-1), -0.94921875(-0x1.e6p-1), 0.1368408203125(0x1.184p-3)] ; [-0.5341796875(-0x1.118p-1), -0.3349609375(-0x1.57p-2), 0.02618408203125(0x1.adp-6), 0.0284881591796875(0x1.d2cp-6)] ; [0.0234527587890625(0x1.804p-6), -0.322509765625(-0x1.4a4p-2), 0.0233917236328125(0x1.7f4p-6), -0.01322174072265625(-0x1.b14p-7)]
- in33 tap(+1,-1): cols [-0.2783203125(-0x1.1dp-2), -0.3837890625(-0x1.89p-2), -0.3662109375(-0x1.77p-2), -0.366455078125(-0x1.774p-2)] ; [-0.599609375(-0x1.33p-1), -0.55908203125(-0x1.1e4p-1), -0.869140625(-0x1.bdp-1), 0.238037109375(0x1.e78p-3)] ; [-1.3525390625(-0x1.5a4p+0), -0.8916015625(-0x1.c88p-1), 0.23046875(0x1.d8p-3), 0.5546875(0x1.1cp-1)] ; [-0.093505859375(-0x1.7fp-4), -0.0011157989501953125(-0x1.248p-10), 0.492919921875(0x1.f8cp-2), -0.12353515625(-0x1.fap-4)]
- in33 tap(+1,+0): cols [0.15087890625(0x1.35p-3), -0.032440185546875(-0x1.09cp-5), -0.128173828125(-0x1.068p-3), -0.19091796875(-0x1.87p-3)] ; [-0.27880859375(-0x1.1d8p-2), 0.03680419921875(0x1.2d8p-5), -0.1348876953125(-0x1.144p-3), 0.060760498046875(0x1.f1cp-5)] ; [-1.041015625(-0x1.0a8p+0), -0.80029296875(-0x1.99cp-1), 0.06732177734375(0x1.13cp-4), 0.193603515625(0x1.8c8p-3)] ; [-0.05682373046875(-0x1.d18p-5), -0.03289794921875(-0x1.0d8p-5), -0.019866943359375(-0x1.458p-6), -0.0828857421875(-0x1.538p-4)]
- in33 tap(+1,+1): cols [-0.341552734375(-0x1.5dcp-2), -0.343994140625(-0x1.604p-2), -0.25048828125(-0x1.008p-2), -0.43994140625(-0x1.c28p-2)] ; [-0.5556640625(-0x1.1c8p-1), -0.6650390625(-0x1.548p-1), -1.4306640625(-0x1.6e4p+0), 0.320068359375(0x1.47cp-2)] ; [-1.26171875(-0x1.43p+0), -0.89453125(-0x1.cap-1), 0.300048828125(0x1.334p-2), 0.349609375(0x1.66p-2)] ; [-0.1478271484375(-0x1.2ecp-3), -0.36572265625(-0x1.768p-2), 0.333251953125(0x1.554p-2), -0.0592041015625(-0x1.e5p-5)]

#### output binding 49
- affine_sub: [-2.1875(-0x1.18p+1), -1.6669921875(-0x1.aacp+0), -1.5205078125(-0x1.854p+0), -1.8359375(-0x1.d6p+0)]
- affine_mul: [0.4638671875(0x1.dbp-2), 0.30078125(0x1.34p-2), 0.457763671875(0x1.d4cp-2), 0.455078125(0x1.d2p-2)]
- affine_add: [-0.36376953125(-0x1.748p-2), -0.11517333984375(-0x1.d7cp-4), -0.38671875(-0x1.8cp-2), -0.36767578125(-0x1.788p-2)]
- in32 tap(-1,-1): cols [0.051513671875(0x1.a6p-5), -0.81005859375(-0x1.9ecp-1), -0.73779296875(-0x1.79cp-1), -0.0159912109375(-0x1.06p-6)] ; [-0.054412841796875(-0x1.bdcp-5), -0.0345458984375(-0x1.1bp-5), 0.319580078125(0x1.474p-2), 0.0127410888671875(0x1.a18p-7)] ; [-0.83056640625(-0x1.a94p-1), 0.1846923828125(0x1.7a4p-3), -0.8369140625(-0x1.ac8p-1), 0.290283203125(0x1.294p-2)] ; [0.470947265625(0x1.e24p-2), 0.38623046875(0x1.8b8p-2), 0.07562255859375(0x1.35cp-4), 0.05035400390625(0x1.9c8p-5)]
- in32 tap(-1,+0): cols [-0.11077880859375(-0x1.c5cp-4), -0.241455078125(-0x1.ee8p-3), -0.005931854248046875(-0x1.84cp-8), -0.057952880859375(-0x1.dacp-5)] ; [0.09625244140625(0x1.8a4p-4), 0.076416015625(0x1.39p-4), 0.07159423828125(0x1.254p-4), -0.001941680908203125(-0x1.fdp-10)] ; [-0.38720703125(-0x1.8c8p-2), 0.01934814453125(0x1.3dp-6), -0.352294921875(-0x1.68cp-2), -0.251953125(-0x1.02p-2)] ; [0.12451171875(0x1.fep-4), 0.356689453125(0x1.6d4p-2), 0.22216796875(0x1.c7p-3), 0.26611328125(0x1.108p-2)]
- in32 tap(-1,+1): cols [0.06494140625(0x1.0ap-4), -0.513671875(-0x1.07p-1), -0.90576171875(-0x1.cfcp-1), -0.69580078125(-0x1.644p-1)] ; [-0.1300048828125(-0x1.0a4p-3), -0.07806396484375(-0x1.3fcp-4), 0.298583984375(0x1.31cp-2), 0.0134735107421875(0x1.b98p-7)] ; [-0.80029296875(-0x1.99cp-1), 0.290283203125(0x1.294p-2), -1.033203125(-0x1.088p+0), 0.15869140625(0x1.45p-3)] ; [0.34375(0x1.6p-2), 0.38427734375(0x1.898p-2), 0.22802734375(0x1.d3p-3), 0.381591796875(0x1.86cp-2)]
- in32 tap(+0,-1): cols [-0.07659912109375(-0x1.39cp-4), -0.2083740234375(-0x1.aacp-3), -0.2103271484375(-0x1.aecp-3), 0.034149169921875(0x1.17cp-5)] ; [-0.050048828125(-0x1.9ap-5), -0.05157470703125(-0x1.a68p-5), 0.2086181640625(0x1.ab4p-3), -0.1307373046875(-0x1.0bcp-3)] ; [-0.06878662109375(-0x1.19cp-4), 0.15966796875(0x1.47p-3), -0.1314697265625(-0x1.0d4p-3), -0.3056640625(-0x1.39p-2)] ; [0.1678466796875(0x1.57cp-3), 0.274658203125(0x1.194p-2), -0.082275390625(-0x1.51p-4), 0.185546875(0x1.7cp-3)]
- in32 tap(+0,+0): cols [-0.34033203125(-0x1.5c8p-2), 0.7421875(0x1.7cp-1), 0.365234375(0x1.76p-2), 0.126953125(0x1.04p-3)] ; [0.0025806427001953125(0x1.524p-9), 0.040802001953125(0x1.4e4p-5), -0.01215362548828125(-0x1.8e4p-7), -0.10723876953125(-0x1.b74p-4)] ; [0.5595703125(0x1.1e8p-1), 0.0222015380859375(0x1.6bcp-6), 0.368896484375(0x1.79cp-2), -0.884765625(-0x1.c5p-1)] ; [-0.04022216796875(-0x1.498p-5), 0.1409912109375(0x1.20cp-3), -0.07275390625(-0x1.2ap-4), 0.2264404296875(0x1.cfcp-3)]
- in32 tap(+0,+1): cols [-0.1651611328125(-0x1.524p-3), -0.26513671875(-0x1.0f8p-2), -0.2117919921875(-0x1.b1cp-3), 0.0748291015625(0x1.328p-4)] ; [-0.12042236328125(-0x1.ed4p-4), -0.11956787109375(-0x1.e9cp-4), 0.253662109375(0x1.03cp-2), -0.038848876953125(-0x1.3e4p-5)] ; [0.111328125(0x1.c8p-4), 0.25341796875(0x1.038p-2), -0.297119140625(-0x1.304p-2), -0.4658203125(-0x1.ddp-2)] ; [0.2430419921875(0x1.f1cp-3), 0.11212158203125(0x1.cb4p-4), -0.1309814453125(-0x1.0c4p-3), 0.2822265625(0x1.21p-2)]
- in32 tap(+1,-1): cols [0.1104736328125(0x1.c48p-4), -0.70751953125(-0x1.6a4p-1), -0.953125(-0x1.e8p-1), -0.319580078125(-0x1.474p-2)] ; [0.006259918212890625(0x1.9a4p-8), -0.0260009765625(-0x1.aap-6), 0.517578125(0x1.09p-1), -0.0294647216796875(-0x1.e2cp-6)] ; [-0.9453125(-0x1.e4p-1), 0.1351318359375(0x1.14cp-3), -1.005859375(-0x1.018p+0), 0.005901336669921875(0x1.82cp-8)] ; [0.5205078125(0x1.0a8p-1), 0.4111328125(0x1.a5p-2), 0.2120361328125(0x1.b24p-3), 0.053741455078125(0x1.b84p-5)]
- in32 tap(+1,+0): cols [-0.2587890625(-0x1.09p-2), -0.194580078125(-0x1.8e8p-3), -0.2025146484375(-0x1.9ecp-3), -0.09600830078125(-0x1.894p-4)] ; [0.029754638671875(0x1.e78p-6), 0.06341552734375(0x1.03cp-4), 0.274658203125(0x1.194p-2), -0.00788116455078125(-0x1.024p-7)] ; [-0.4326171875(-0x1.bbp-2), -0.040374755859375(-0x1.4acp-5), -0.457275390625(-0x1.d44p-2), -0.355224609375(-0x1.6bcp-2)] ; [0.1881103515625(0x1.814p-3), 0.375732421875(0x1.80cp-2), 0.1259765625(0x1.02p-3), 0.295654296875(0x1.2ecp-2)]
- in32 tap(+1,+1): cols [-0.138916015625(-0x1.1c8p-3), -0.83984375(-0x1.aep-1), -1.021484375(-0x1.058p+0), -0.394287109375(-0x1.93cp-2)] ; [-0.0284423828125(-0x1.d2p-6), -0.048095703125(-0x1.8ap-5), 0.48974609375(0x1.f58p-2), 0.0750732421875(0x1.338p-4)] ; [-0.9208984375(-0x1.d78p-1), 0.26953125(0x1.14p-2), -0.96240234375(-0x1.eccp-1), 0.21142578125(0x1.b1p-3)] ; [0.44970703125(0x1.cc8p-2), 0.38916015625(0x1.8e8p-2), 0.1275634765625(0x1.054p-3), 0.361083984375(0x1.71cp-2)]
- in33 tap(-1,-1): cols [-0.2322998046875(-0x1.dbcp-3), -0.2008056640625(-0x1.9b4p-3), -0.4599609375(-0x1.d7p-2), -0.49365234375(-0x1.f98p-2)] ; [-1.119140625(-0x1.1e8p+0), 0.43115234375(0x1.b98p-2), -0.030548095703125(-0x1.f48p-6), -0.04705810546875(-0x1.818p-5)] ; [0.01488494873046875(0x1.e7cp-7), -0.3935546875(-0x1.93p-2), 0.07720947265625(0x1.3c4p-4), -0.25927734375(-0x1.098p-2)] ; [0.12371826171875(0x1.facp-4), -1.533203125(-0x1.888p+0), -0.1263427734375(-0x1.02cp-3), -1.0068359375(-0x1.01cp+0)]
- in33 tap(-1,+0): cols [0.050018310546875(0x1.99cp-5), -0.0228424072265625(-0x1.764p-6), -0.0673828125(-0x1.14p-4), -0.1016845703125(-0x1.a08p-4)] ; [-0.1949462890625(-0x1.8f4p-3), 0.00135040283203125(0x1.62p-10), -0.3623046875(-0x1.73p-2), -0.429931640625(-0x1.b84p-2)] ; [-0.09100341796875(-0x1.74cp-4), -0.1927490234375(-0x1.8acp-3), -0.2088623046875(-0x1.abcp-3), -0.19091796875(-0x1.87p-3)] ; [-0.5966796875(-0x1.318p-1), -0.4560546875(-0x1.d3p-2), -0.2008056640625(-0x1.9b4p-3), -0.396484375(-0x1.96p-2)]
- in33 tap(-1,+1): cols [-0.6904296875(-0x1.618p-1), -0.393798828125(-0x1.934p-2), -0.426513671875(-0x1.b4cp-2), -0.054107666015625(-0x1.bb4p-5)] ; [-1.0625(-0x1.1p+0), 0.5029296875(0x1.018p-1), 0.0595703125(0x1.e8p-5), -0.235595703125(-0x1.e28p-3)] ; [-0.2288818359375(-0x1.d4cp-3), -0.446533203125(-0x1.c94p-2), 0.01259613037109375(0x1.9ccp-7), -0.366455078125(-0x1.774p-2)] ; [0.11181640625(0x1.cap-4), -1.3671875(-0x1.5ep+0), -0.288330078125(-0x1.274p-2), -1.427734375(-0x1.6d8p+0)]
- in33 tap(+0,-1): cols [-0.01424407958984375(-0x1.d2cp-7), 0.13330078125(0x1.11p-3), 0.2364501953125(0x1.e44p-3), -0.004955291748046875(-0x1.44cp-8)] ; [-0.64453125(-0x1.4ap-1), -0.01277923583984375(-0x1.a2cp-7), -0.2587890625(-0x1.09p-2), -0.11065673828125(-0x1.c54p-4)] ; [-0.2158203125(-0x1.bap-3), -0.169677734375(-0x1.5b8p-3), -0.384765625(-0x1.8ap-2), -0.07354736328125(-0x1.2d4p-4)] ; [-0.33154296875(-0x1.538p-2), -1.4365234375(-0x1.6fcp+0), -0.176025390625(-0x1.688p-3), -0.75537109375(-0x1.82cp-1)]
- in33 tap(+0,+0): cols [0.34521484375(0x1.618p-2), 0.304443359375(0x1.37cp-2), 0.19677734375(0x1.93p-3), 0.133544921875(0x1.118p-3)] ; [0.36279296875(0x1.738p-2), -0.346923828125(-0x1.634p-2), -0.53857421875(-0x1.13cp-1), -0.370361328125(-0x1.7b4p-2)] ; [-0.216796875(-0x1.bcp-3), 0.049957275390625(0x1.994p-5), -0.49658203125(-0x1.fc8p-2), 0.2401123046875(0x1.ebcp-3)] ; [-0.814453125(-0x1.a1p-1), 0.1710205078125(0x1.5e4p-3), -0.221923828125(-0x1.c68p-3), 0.39599609375(0x1.958p-2)]
- in33 tap(+0,+1): cols [-0.14404296875(-0x1.27p-3), -0.2139892578125(-0x1.b64p-3), 0.1456298828125(0x1.2a4p-3), -0.03875732421875(-0x1.3d8p-5)] ; [-0.673828125(-0x1.59p-1), 0.1776123046875(0x1.6bcp-3), -0.236328125(-0x1.e4p-3), -0.11676025390625(-0x1.de4p-4)] ; [-0.349853515625(-0x1.664p-2), -0.275634765625(-0x1.1a4p-2), -0.27783203125(-0x1.1c8p-2), -0.2568359375(-0x1.07p-2)] ; [-0.290283203125(-0x1.294p-2), -1.3076171875(-0x1.4ecp+0), -0.08978271484375(-0x1.6fcp-4), -0.86083984375(-0x1.b8cp-1)]
- in33 tap(+1,-1): cols [-0.03277587890625(-0x1.0c8p-5), -0.291259765625(-0x1.2a4p-2), -0.116455078125(-0x1.ddp-4), -0.391357421875(-0x1.90cp-2)] ; [-0.8916015625(-0x1.c88p-1), 0.36181640625(0x1.728p-2), -0.032012939453125(-0x1.064p-5), 0.1815185546875(0x1.73cp-3)] ; [-0.0164642333984375(-0x1.0dcp-6), -0.30517578125(-0x1.388p-2), -0.216552734375(-0x1.bb8p-3), -0.1572265625(-0x1.42p-3)] ; [0.11590576171875(0x1.dacp-4), -1.6376953125(-0x1.a34p+0), -0.0028533935546875(-0x1.76p-9), -1.2021484375(-0x1.33cp+0)]
- in33 tap(+1,+0): cols [0.00672149658203125(0x1.b88p-8), -0.040496826171875(-0x1.4bcp-5), -0.05169677734375(-0x1.a78p-5), -0.0181427001953125(-0x1.294p-6)] ; [-0.0125274658203125(-0x1.9a8p-7), 0.011627197265625(0x1.7dp-7), -0.41650390625(-0x1.aa8p-2), -0.36962890625(-0x1.7a8p-2)] ; [-0.0258941650390625(-0x1.a84p-6), -0.1314697265625(-0x1.0d4p-3), -0.36083984375(-0x1.718p-2), -0.044677734375(-0x1.6ep-5)] ; [-0.399658203125(-0x1.994p-2), -0.46142578125(-0x1.d88p-2), -0.01702880859375(-0x1.17p-6), -0.1993408203125(-0x1.984p-3)]
- in33 tap(+1,+1): cols [-0.681640625(-0x1.5dp-1), -0.43505859375(-0x1.bd8p-2), -0.07464599609375(-0x1.31cp-4), -0.0604248046875(-0x1.efp-5)] ; [-1.3046875(-0x1.4ep+0), 0.58837890625(0x1.2d4p-1), -0.1328125(-0x1.1p-3), -0.189208984375(-0x1.838p-3)] ; [0.11834716796875(0x1.e4cp-4), -0.2440185546875(-0x1.f3cp-3), -0.334716796875(-0x1.56cp-2), -0.331298828125(-0x1.534p-2)] ; [0.264892578125(0x1.0f4p-2), -1.5146484375(-0x1.83cp+0), 0.0494384765625(0x1.95p-5), -1.458984375(-0x1.758p+0)]
