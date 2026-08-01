# Spec: shader_29 — 3x3 fp16 convolution with residual add (flow merge)

Functional specification derived solely from `asm/shader_29.spvasm`. Role
names are functional labels chosen by the spec author; the binary contains no
names.

## 1. Interface

- Entry point: GLCompute `main`, workgroup size **16 x 16 x 1**.
- Capabilities: `Float16` — all arithmetic is 16-bit float
  (GLSL: `float16_t`/`f16vec4`/`f16mat4`).
- No UBO, no push constants, no specialization constants.
- All descriptors in **set 0**:

| Binding | Kind | Role name | Notes |
|---|---|---|---|
| 32 | combined image sampler, 2D float | src | sampled 9x (3x3 neighborhood, explicit LOD 0); also queried with `textureSize(.,0)` |
| 33 | combined image sampler, 2D float | residual | sampled once, explicit LOD 0 |
| 48 | storage image 2D, **format Rgba16f** | outMerged | write-only (`NonReadable`); `imageSize`-queried for the bounds guard; written once |

## 2. Per-invocation behavior

Precision: `H4(sample)` = the fp32 vec4 texture result converted to
`f16vec4`. All matrix multiplies and additions below are fp16; the final
result is widened to fp32 only for the `imageStore` (whose target is rgba16f
anyway).

```
p  = ivec2(gl_GlobalInvocationID.xy)
if (any(greaterThanEqual(p, imageSize(outMerged)))) return;

S  = vec2(textureSize(src, 0))                     // dimensions of binding 32
uv = (vec2(gl_GlobalInvocationID.xy) + vec2(0.5, 0.5)) / S

acc  = W_(-1,-1) * H4(textureLodOffset(src, uv, 0.0, ivec2(-1,-1)))
acc += W_(-1, 0) * H4(textureLodOffset(src, uv, 0.0, ivec2(-1, 0)))
acc += W_(-1, 1) * H4(textureLodOffset(src, uv, 0.0, ivec2(-1, 1)))
acc += W_( 0,-1) * H4(textureLodOffset(src, uv, 0.0, ivec2( 0,-1)))
acc += W_( 0, 0) * H4(textureLod      (src, uv, 0.0))                 // center: no offset
acc += W_( 0, 1) * H4(textureLodOffset(src, uv, 0.0, ivec2( 0, 1)))
acc += W_( 1,-1) * H4(textureLodOffset(src, uv, 0.0, ivec2( 1,-1)))
acc += W_( 1, 0) * H4(textureLodOffset(src, uv, 0.0, ivec2( 1, 0)))
acc += W_( 1, 1) * H4(textureLodOffset(src, uv, 0.0, ivec2( 1, 1)))
acc += b
acc += H4(textureLod(residual, uv, 0.0))

imageStore(outMerged, p, vec4(acc))
```

Each `W_o` is a constant 4x4 fp16 matrix and `W_o * v` is the ordinary
matrix-vector product: `(W_o * v)[i] = sum_j W_o[i][j] * v[j]` with `i` the
output channel and `j` the input channel of the sample at offset `o`.
Accumulation happens tap by tap in exactly the order listed (fp16 adds), then
the bias `b`, then the residual sample.

The tap offsets are constant texel offsets (`ConstOffset` /
`textureLodOffset`), applied in texel space of the sampled image.

## 3. Weights (fp16, exact)

Every value is an IEEE-754 binary16 constant. The decimal shown is its exact
value; the hex-float literal in parentheses is the bit-exact source form.
Tables are row-major: row `i` = output channel, column `j` = input channel
(in the SPIR-V the matrices are stored as 4 column vectors; these tables are
the transposed presentation of those columns).

### W_(-1,-1)

| out ch i | j=0 | j=1 | j=2 | j=3 |
|---|---|---|---|---|
| 0 | 0.2978515625 (0x1.31p-2) | 0.1429443359375 (0x1.24cp-3) | 0.20263671875 (0x1.9fp-3) | -0.6982421875 (-0x1.658p-1) |
| 1 | 0.27880859375 (0x1.1d8p-2) | 0.12115478515625 (0x1.f04p-4) | 0.2030029296875 (0x1.9fcp-3) | -0.69775390625 (-0x1.654p-1) |
| 2 | -0.744140625 (-0x1.7dp-1) | 0.11199951171875 (0x1.cacp-4) | 0.38818359375 (0x1.8d8p-2) | 0.326416015625 (0x1.4e4p-2) |
| 3 | -0.70068359375 (-0x1.66cp-1) | 0.135009765625 (0x1.148p-3) | 0.3916015625 (0x1.91p-2) | 0.32373046875 (0x1.4b8p-2) |

### W_(-1,0)

| out ch i | j=0 | j=1 | j=2 | j=3 |
|---|---|---|---|---|
| 0 | 0.6103515625 (0x1.388p-1) | 0.47900390625 (0x1.ea8p-2) | 0.399658203125 (0x1.994p-2) | -0.66015625 (-0x1.52p-1) |
| 1 | 0.59814453125 (0x1.324p-1) | 0.47021484375 (0x1.e18p-2) | 0.395263671875 (0x1.94cp-2) | -0.6337890625 (-0x1.448p-1) |
| 2 | -0.07452392578125 (-0x1.314p-4) | 0.3330078125 (0x1.55p-2) | 0.439453125 (0x1.c2p-2) | 0.1593017578125 (0x1.464p-3) |
| 3 | -0.0933837890625 (-0x1.7e8p-4) | 0.36669921875 (0x1.778p-2) | 0.43896484375 (0x1.c18p-2) | 0.1490478515625 (0x1.314p-3) |

### W_(-1,1)

| out ch i | j=0 | j=1 | j=2 | j=3 |
|---|---|---|---|---|
| 0 | 0.317626953125 (0x1.454p-2) | 0.099365234375 (0x1.97p-4) | 0.275146484375 (0x1.19cp-2) | -0.69970703125 (-0x1.664p-1) |
| 1 | 0.295166015625 (0x1.2e4p-2) | 0.07647705078125 (0x1.394p-4) | 0.26708984375 (0x1.118p-2) | -0.6669921875 (-0x1.558p-1) |
| 2 | -0.8017578125 (-0x1.9a8p-1) | 0.212890625 (0x1.b4p-3) | 0.279052734375 (0x1.1dcp-2) | 0.314453125 (0x1.42p-2) |
| 3 | -0.76171875 (-0x1.86p-1) | 0.2216796875 (0x1.c6p-3) | 0.306396484375 (0x1.39cp-2) | 0.320068359375 (0x1.47cp-2) |

### W_(0,-1)

| out ch i | j=0 | j=1 | j=2 | j=3 |
|---|---|---|---|---|
| 0 | 0.56640625 (0x1.22p-1) | 0.47265625 (0x1.e4p-2) | 0.37353515625 (0x1.7e8p-2) | -0.625 (-0x1.4p-1) |
| 1 | 0.576171875 (0x1.27p-1) | 0.468017578125 (0x1.df4p-2) | 0.36474609375 (0x1.758p-2) | -0.6630859375 (-0x1.538p-1) |
| 2 | 0.0634765625 (0x1.04p-4) | 0.405029296875 (0x1.9ecp-2) | 0.541015625 (0x1.15p-1) | 0.2158203125 (0x1.bap-3) |
| 3 | 0.0697021484375 (0x1.1d8p-4) | 0.41650390625 (0x1.aa8p-2) | 0.556640625 (0x1.1dp-1) | 0.20947265625 (0x1.adp-3) |

### W_(0,0)

| out ch i | j=0 | j=1 | j=2 | j=3 |
|---|---|---|---|---|
| 0 | 0.85791015625 (0x1.b74p-1) | 0.826171875 (0x1.a7p-1) | 0.5673828125 (0x1.228p-1) | -0.55224609375 (-0x1.1acp-1) |
| 1 | 0.8330078125 (0x1.aa8p-1) | 0.7802734375 (0x1.8f8p-1) | 0.5419921875 (0x1.158p-1) | -0.5537109375 (-0x1.1b8p-1) |
| 2 | 0.6259765625 (0x1.408p-1) | 0.6591796875 (0x1.518p-1) | 0.61669921875 (0x1.3bcp-1) | 0.0438232421875 (0x1.67p-5) |
| 3 | 0.591796875 (0x1.2fp-1) | 0.66015625 (0x1.52p-1) | 0.6171875 (0x1.3cp-1) | 0.0533447265625 (0x1.b5p-5) |

### W_(0,1)

| out ch i | j=0 | j=1 | j=2 | j=3 |
|---|---|---|---|---|
| 0 | 0.59033203125 (0x1.2e4p-1) | 0.439208984375 (0x1.c1cp-2) | 0.46337890625 (0x1.da8p-2) | -0.67529296875 (-0x1.59cp-1) |
| 1 | 0.5673828125 (0x1.228p-1) | 0.419677734375 (0x1.adcp-2) | 0.44873046875 (0x1.cb8p-2) | -0.6640625 (-0x1.54p-1) |
| 2 | -0.1058349609375 (-0x1.b18p-4) | 0.5283203125 (0x1.0e8p-1) | 0.47509765625 (0x1.e68p-2) | 0.2344970703125 (0x1.e04p-3) |
| 3 | -0.12890625 (-0x1.08p-3) | 0.53759765625 (0x1.134p-1) | 0.48193359375 (0x1.ed8p-2) | 0.2325439453125 (0x1.dc4p-3) |

### W_(1,-1)

| out ch i | j=0 | j=1 | j=2 | j=3 |
|---|---|---|---|---|
| 0 | 0.32373046875 (0x1.4b8p-2) | 0.1268310546875 (0x1.03cp-3) | 0.25390625 (0x1.04p-2) | -0.66845703125 (-0x1.564p-1) |
| 1 | 0.308349609375 (0x1.3bcp-2) | 0.11712646484375 (0x1.dfcp-4) | 0.2548828125 (0x1.05p-2) | -0.6845703125 (-0x1.5e8p-1) |
| 2 | -0.59814453125 (-0x1.324p-1) | 0.1986083984375 (0x1.96cp-3) | 0.40625 (0x1.ap-2) | 0.290771484375 (0x1.29cp-2) |
| 3 | -0.54345703125 (-0x1.164p-1) | 0.2012939453125 (0x1.9c4p-3) | 0.403076171875 (0x1.9ccp-2) | 0.289794921875 (0x1.28cp-2) |

### W_(1,0)

| out ch i | j=0 | j=1 | j=2 | j=3 |
|---|---|---|---|---|
| 0 | 0.5859375 (0x1.2cp-1) | 0.438232421875 (0x1.c0cp-2) | 0.444091796875 (0x1.c6cp-2) | -0.64892578125 (-0x1.4c4p-1) |
| 1 | 0.595703125 (0x1.31p-1) | 0.453369140625 (0x1.d04p-2) | 0.447021484375 (0x1.c9cp-2) | -0.6533203125 (-0x1.4e8p-1) |
| 2 | -0.0224151611328125 (-0x1.6f4p-6) | 0.45068359375 (0x1.cd8p-2) | 0.475341796875 (0x1.e6cp-2) | 0.1353759765625 (0x1.154p-3) |
| 3 | -0.0367431640625 (-0x1.2dp-5) | 0.455810546875 (0x1.d2cp-2) | 0.47216796875 (0x1.e38p-2) | 0.1385498046875 (0x1.1bcp-3) |

### W_(1,1)

| out ch i | j=0 | j=1 | j=2 | j=3 |
|---|---|---|---|---|
| 0 | 0.316650390625 (0x1.444p-2) | 0.06280517578125 (0x1.014p-4) | 0.30712890625 (0x1.3a8p-2) | -0.71337890625 (-0x1.6d4p-1) |
| 1 | 0.325927734375 (0x1.4dcp-2) | 0.07110595703125 (0x1.234p-4) | 0.3095703125 (0x1.3dp-2) | -0.6943359375 (-0x1.638p-1) |
| 2 | -0.81396484375 (-0x1.a0cp-1) | 0.341552734375 (0x1.5dcp-2) | 0.338134765625 (0x1.5a4p-2) | 0.291259765625 (0x1.2a4p-2) |
| 3 | -0.798828125 (-0x1.99p-1) | 0.3369140625 (0x1.59p-2) | 0.3212890625 (0x1.49p-2) | 0.30078125 (0x1.34p-2) |

bias b:

| i | value |
|---|---|
| 0 | 0.7431640625 (0x1.7c8p-1) |
| 1 | 0.830078125 (0x1.a9p-1) |
| 2 | 0.434814453125 (0x1.bd4p-2) |
| 3 | 0.371337890625 (0x1.7c4p-2) |

Other literals: 0.5 (texel center), LOD 0.0.

## 4. Control flow / boundary behavior

- Single early-out: `any(p >= imageSize(outMerged))` against the output
  storage image's size. No loops (the 3x3 stencil is fully unrolled), no
  other branches.
- No coordinate clamping in the math. `uv` itself stays inside (0,1) for
  in-range `p` only if the dispatch matches the size of binding 32; the
  +-1-texel `ConstOffset` taps step outside the image at its borders, where
  behavior is decided by the externally supplied sampler state (address
  mode), not by this module.
- Exactly one image write per surviving invocation, at `p`.

## 5. Interpretation (hint, not normative)

This is a single 3x3 convolution layer (4 input channels -> 4 output
channels) with bias, computed in fp16, plus a skip/residual connection: the
4-channel map at binding 33 is added straight through. In the pipeline this
merges/refines two flow fields — binding 32 carrying the features being
convolved and binding 33 the pass-through flow being corrected.
