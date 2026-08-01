# shader_09 — coarse flow from 3x3 matching costs (two outputs)

Source of truth: `asm/shader_09.spvasm`. One straight-line compute pass, one
texel of each of two flow outputs per invocation. It samples three 8-channel
feature maps (each stored as a pair of RGBA textures), computes 18 matching
costs (9 spatial offsets x 2 query descriptors), normalizes them, and maps
them through two small learned linear layers to produce a "forward" and a
"backward" 4-channel output.

## 1. Interface

- Workgroup size: **16 x 16 x 1**.
- Built-ins used: `gl_GlobalInvocationID` only.
- All descriptors are in **set 0**:

| binding | kind | format | access | role (functional, see note) |
|---|---|---|---|---|
| 32 | combined image sampler, 2D float | unknown to shader | read | query descriptor A, channels 0..3 |
| 33 | combined image sampler, 2D float | unknown to shader | read | query descriptor A, channels 4..7 |
| 34 | combined image sampler, 2D float | unknown to shader | read | query descriptor B, channels 0..3 |
| 35 | combined image sampler, 2D float | unknown to shader | read | query descriptor B, channels 4..7 |
| 36 | combined image sampler, 2D float | unknown to shader | read | reference descriptor R, channels 0..3 (sampled at 9 offsets) |
| 37 | combined image sampler, 2D float | unknown to shader | read | reference descriptor R, channels 4..7 (sampled at 9 offsets) |
| 48 | storage image 2D | `rgba8` | write-only (`NonReadable`) | output F ("forward" result) |
| 49 | storage image 2D | `rgba8` | write-only (`NonReadable`) | output B ("backward" result) |

- **No UBO. No push constants. No spec constants.**
- Requires FP16 arithmetic (`GL_EXT_shader_explicit_arithmetic_types_float16`):
  every arithmetic step between sampling and the final store is IEEE binary16.

Note on roles: the dataflow pairs the samplers as (32,33), (34,35), (36,37) —
each pair is dotted together as one 8-component descriptor. The pipeline-level
meaning of A, B, R (which frame/pyramid level each holds) is decided by the
host bindings, not by this shader; the pairing above is what the code does.
(This grouping does NOT match a "32-34 = pyramid levels of frame 1, 35-37 =
pyramid levels of frame 2" reading; the code pairs 33 with 32, not with a
same-frame pyramid.)

## 2. Behavior

Notation:

```
p  = ivec2(gl_GlobalInvocationID.xy)
if (p.x >= imageSize(outF).x || p.y >= imageSize(outF).y) return;   // signed compare, see section 4
sz = textureSize(texA0, 0)                    // binding 32, LOD 0
uv = (vec2(p) + 0.5) / vec2(sz)
```

All texture reads are `textureLod(..., uv, 0.0)` (explicit LOD 0) at this one
`uv`, some with a compile-time texel offset (`textureLodOffset`). Offsets are
in texel units of the *sampled* texture's own LOD-0 grid. Every sampled
result (vec4, float32) is immediately converted to `f16vec4`:

```
a0 = f16vec4(textureLod(texA0, uv, 0.0))          // binding 32
a1 = f16vec4(textureLod(texA1, uv, 0.0))          // binding 33
b0 = f16vec4(textureLod(texB0, uv, 0.0))          // binding 34
b1 = f16vec4(textureLod(texB1, uv, 0.0))          // binding 35
r0(o) = f16vec4(textureLodOffset(texR0, uv, 0.0, o))   // binding 36, o = ivec2 offset
r1(o) = f16vec4(textureLodOffset(texR1, uv, 0.0, o))   // binding 37
```

### 2.1 Matching costs

For each offset `o`, two 8-channel dot products (each a 4-component fp16
`dot`, then one fp16 add):

```
costA(o) = dot(a0, r0(o)) + dot(a1, r1(o))
costB(o) = dot(b0, r0(o)) + dot(b1, r1(o))
```

The 9 offsets are grouped as:

```
group 1: (-1,-1), (0,-1), (1,-1), (-1,0)     -> vec components x, y, z, w
group 2: ( 0, 0), (1, 0), (-1,1), ( 0,1)     -> vec components x, y, z, w
single : ( 1, 1)
```

giving, for X in {A, B}:

```
cX1 = f16vec4(costX(-1,-1), costX(0,-1), costX(1,-1), costX(-1,0))
cX2 = f16vec4(costX( 0, 0), costX(1, 0), costX(-1,1), costX( 0,1))
cX9 = costX(1,1)                                    // scalar
```

### 2.2 Cost normalization (all fp16, componentwise)

```
nX1 = clamp((cX1 - biasG1) * scaleG1 + postG1, 0.0, 1.0)
nX2 = clamp((cX2 - biasG2) * scaleG2 + postG2, 0.0, 1.0)
qX  = clamp((cX9 - bias9 ) * scale9  + post9 , 0.0, 1.0)    // scalar
```

The three (bias, scale, post) sets are shared between A and B; constants in
section 3.

### 2.3 Linear layers and stores

Each output is an 18-input, 4-output linear layer over
`(nA1, nA2, qA, nB1, nB2, qB)` followed by an affine rescale. Matrices are
GLSL `mat4` built from the four **columns** listed in section 3
(`M * v = v.x*col0 + v.y*col1 + v.z*col2 + v.w*col3`). Accumulate fp16, in
exactly this association order:

```
sF = ((((Wf_a1*nA1 + Wf_a2*nA2) + wf_a9*qA) + Wf_b1*nB1) + Wf_b2*nB2) + wf_b9*qB
outF_val = (sF - subF) * mulF + addF
imageStore(outF, p, vec4(outF_val))          // widen to float32, rgba8 quantizes

sB = ((((Wb_a1*nA1 + Wb_a2*nA2) + wb_a9*qA) + Wb_b1*nB1) + Wb_b2*nB2) + wb_b9*qB
outB_val = (sB - subB) * mulB + addB
imageStore(outB, p, vec4(outB_val))          // binding 49, same coordinate p
```

`wf_a9*qA` etc. are vector-times-scalar (fp16). The two stores use the same
coordinate `p` and both depend on all 18 normalized costs; only the weights
differ.

## 3. Constants

All constants below are exact IEEE binary16 values. The decimal expansions
are exact (they round-trip to the same fp16 bit pattern); the trailing
comment on each line gives the same values as C99 hex-float literals.

```
biasG1  = vec4(2.5, 2.521484375, 2.50390625, 2.51953125);  // 0x1.4p+1 0x1.42cp+1 0x1.408p+1 0x1.428p+1
scaleG1 = vec4(1.0341796875, 0.72412109375, 0.6572265625, 1.0205078125);  // 0x1.08cp+0 0x1.72cp-1 0x1.508p-1 0x1.054p+0
postG1  = vec4(-0.4296875, -0.042877197265625, -0.4951171875, -0.11126708984375);  // -0x1.b8p-2 -0x1.5f4p-5 -0x1.fbp-2 -0x1.c7cp-4
biasG2  = vec4(2.568359375, 2.53515625, 2.498046875, 2.521484375);  // 0x1.48cp+1 0x1.448p+1 0x1.3fcp+1 0x1.42cp+1
scaleG2 = vec4(0.53466796875, 0.427978515625, 0.6787109375, 0.8740234375);  // 0x1.11cp-1 0x1.b64p-2 0x1.5b8p-1 0x1.bf8p-1
postG2  = vec4(0.10174560546875, 0.266357421875, -0.0150909423828125, -0.380126953125);  // 0x1.a0cp-4 0x1.10cp-2 -0x1.ee8p-7 -0x1.854p-2
bias9  = 2.509765625;  scale9 = 0.480712890625;  post9 = 0.278076171875;  // 0x1.414p+1 0x1.ec4p-2 0x1.1ccp-2

Wf_a1 = mat4(
    vec4(-0.6171875, -0.098876953125, -0.003223419189453125, 0.05706787109375),  // -0x1.3cp-1 -0x1.95p-4 -0x1.a68p-9 0x1.d38p-5
    vec4(-0.201171875, 0.275146484375, -0.053924560546875, -0.409912109375),  // -0x1.9cp-3 0x1.19cp-2 -0x1.b9cp-5 -0x1.a3cp-2
    vec4(-0.076171875, -0.0161285400390625, 0.3349609375, -0.54541015625),  // -0x1.38p-4 -0x1.084p-6 0x1.57p-2 -0x1.174p-1
    vec4(-0.1729736328125, 0.1617431640625, -0.0648193359375, 0.245361328125));  // -0x1.624p-3 0x1.4b4p-3 -0x1.098p-4 0x1.f68p-3

Wf_a2 = mat4(
    vec4(0.302978515625, 0.5341796875, -0.433837890625, -0.21142578125),  // 0x1.364p-2 0x1.118p-1 -0x1.bc4p-2 -0x1.b1p-3
    vec4(0.375732421875, -0.01236724853515625, 0.239990234375, -0.291748046875),  // 0x1.80cp-2 -0x1.954p-7 0x1.eb8p-3 -0x1.2acp-2
    vec4(-0.25830078125, 0.14013671875, -0.054351806640625, 0.078369140625),  // -0x1.088p-2 0x1.1fp-3 -0x1.bd4p-5 0x1.41p-4
    vec4(0.05908203125, 0.185546875, 0.0665283203125, -0.66748046875));  // 0x1.e4p-5 0x1.7cp-3 0x1.108p-4 -0x1.55cp-1

Wf_b1 = mat4(
    vec4(-0.51171875, -0.256103515625, 0.06341552734375, -0.06170654296875),  // -0x1.06p-1 -0x1.064p-2 0x1.03cp-4 -0x1.f98p-5
    vec4(-0.1678466796875, -0.25439453125, 0.391845703125, -0.1029052734375),  // -0x1.57cp-3 -0x1.048p-2 0x1.914p-2 -0x1.a58p-4
    vec4(-0.01464080810546875, -0.238525390625, 0.1650390625, -0.321044921875),  // -0x1.dfcp-7 -0x1.e88p-3 0x1.52p-3 -0x1.48cp-2
    vec4(-0.361083984375, -0.2294921875, 0.183349609375, 0.51953125));  // -0x1.71cp-2 -0x1.d6p-3 0x1.778p-3 0x1.0ap-1

Wf_b2 = mat4(
    vec4(0.8525390625, -1.013671875, -0.8603515625, 0.3408203125),  // 0x1.b48p-1 -0x1.038p+0 -0x1.b88p-1 0x1.5dp-2
    vec4(0.30224609375, -0.10955810546875, 0.39599609375, -0.2481689453125),  // 0x1.358p-2 -0x1.c0cp-4 0x1.958p-2 -0x1.fc4p-3
    vec4(-0.439208984375, -0.046905517578125, 0.296142578125, 0.1353759765625),  // -0x1.c1cp-2 -0x1.804p-5 0x1.2f4p-2 0x1.154p-3
    vec4(-0.00047397613525390625, 0.1292724609375, 0.318359375, -0.395263671875));  // -0x1.f1p-12 0x1.08cp-3 0x1.46p-2 -0x1.94cp-2

wf_a9 = vec4(-0.073486328125, 0.1968994140625, -0.061004638671875, -0.548828125);  // -0x1.2dp-4 0x1.934p-3 -0x1.f3cp-5 -0x1.19p-1
wf_b9 = vec4(-0.053466796875, 0.1724853515625, 0.1519775390625, -0.0129852294921875);  // -0x1.b6p-5 0x1.614p-3 0x1.374p-3 -0x1.a98p-7
subF  = vec4(0.12493896484375, -0.004108428955078125, 0.08489990234375, -0.276611328125);  // 0x1.ffcp-4 -0x1.0d4p-8 0x1.5bcp-4 -0x1.1b4p-2
mulF  = vec4(1.67578125, 5.44140625, 4.0625, 2.37109375);  // 0x1.adp+0 0x1.5c4p+2 0x1.04p+2 0x1.2f8p+1
addF  = vec4(0.14404296875, -0.186767578125, 0.034576416015625, -0.2451171875);  // 0x1.27p-3 -0x1.7e8p-3 0x1.1b4p-5 -0x1.f6p-3

Wb_a1 = mat4(
    vec4(-0.06646728515625, 0.132080078125, 0.10211181640625, -0.1077880859375),  // -0x1.104p-4 0x1.0e8p-3 0x1.a24p-4 -0x1.b98p-4
    vec4(0.01702880859375, -0.18701171875, -0.34912109375, -0.04522705078125),  // 0x1.17p-6 -0x1.7fp-3 -0x1.658p-2 -0x1.728p-5
    vec4(0.1290283203125, -0.033416748046875, -0.2529296875, 0.034515380859375),  // 0x1.084p-3 -0x1.11cp-5 -0x1.03p-2 0x1.1acp-5
    vec4(0.0321044921875, -0.1719970703125, -0.01235198974609375, -0.28125));  // 0x1.07p-5 -0x1.604p-3 -0x1.94cp-7 -0x1.2p-2

Wb_a2 = mat4(
    vec4(1.0380859375, -0.225341796875, -0.26123046875, -0.4716796875),  // 0x1.09cp+0 -0x1.cd8p-3 -0x1.0b8p-2 -0x1.e3p-2
    vec4(0.0662841796875, -0.14501953125, -0.03436279296875, 0.277587890625),  // 0x1.0f8p-4 -0x1.29p-3 -0x1.198p-5 0x1.1c4p-2
    vec4(-0.10638427734375, -0.00730133056640625, -0.10723876953125, 0.1124267578125),  // -0x1.b3cp-4 -0x1.de8p-8 -0x1.b74p-4 0x1.cc8p-4
    vec4(-0.06939697265625, -0.1727294921875, -0.314453125, 0.04400634765625));  // -0x1.1c4p-4 -0x1.61cp-3 -0x1.42p-2 0x1.688p-5

Wb_b1 = mat4(
    vec4(0.02752685546875, 0.14208984375, 0.192626953125, -0.197509765625),  // 0x1.c3p-6 0x1.23p-3 0x1.8a8p-3 -0x1.948p-3
    vec4(-0.1563720703125, -0.265380859375, -0.0111083984375, 0.1336669921875),  // -0x1.404p-3 -0x1.0fcp-2 -0x1.6cp-7 0x1.11cp-3
    vec4(0.1590576171875, 0.01421356201171875, -0.178466796875, -0.1771240234375),  // 0x1.45cp-3 0x1.d1cp-7 -0x1.6d8p-3 -0x1.6acp-3
    vec4(-0.279296875, -0.1534423828125, 0.07720947265625, -0.3857421875));  // -0x1.1ep-2 -0x1.3a4p-3 0x1.3c4p-4 -0x1.8bp-2

Wb_b2 = mat4(
    vec4(0.8505859375, -0.60693359375, -0.297607421875, 0.1439208984375),  // 0x1.b38p-1 -0x1.36cp-1 -0x1.30cp-2 0x1.26cp-3
    vec4(-0.1905517578125, -0.2235107421875, 0.019561767578125, 0.8798828125),  // -0x1.864p-3 -0x1.c9cp-3 0x1.408p-6 0x1.c28p-1
    vec4(0.116943359375, 0.0157928466796875, 0.034027099609375, 0.2724609375),  // 0x1.dfp-4 0x1.02cp-6 0x1.16cp-5 0x1.17p-2
    vec4(-0.1539306640625, 0.0080108642578125, -0.11529541015625, 0.131103515625));  // -0x1.3b4p-3 0x1.068p-7 -0x1.d84p-4 0x1.0c8p-3

wb_a9 = vec4(0.11322021484375, -0.1365966796875, -0.301513671875, 0.307861328125);  // 0x1.cfcp-4 -0x1.17cp-3 -0x1.34cp-2 0x1.3b4p-2
wb_b9 = vec4(0.1278076171875, -0.1292724609375, -0.173828125, 0.48583984375);  // 0x1.05cp-3 -0x1.08cp-3 -0x1.64p-3 0x1.f18p-2
subB  = vec4(0.30712890625, -0.40625, -0.285888671875, 0.476806640625);  // 0x1.3a8p-2 -0x1.ap-2 -0x1.24cp-2 0x1.e84p-2
mulB  = vec4(0.599609375, 2.76171875, 2.630859375, 3.283203125);  // 0x1.33p-1 0x1.618p+1 0x1.50cp+1 0x1.a44p+1
addB  = vec4(0.141845703125, -0.390869140625, -0.041107177734375, 0.6826171875);  // 0x1.228p-3 -0x1.904p-2 -0x1.50cp-5 0x1.5d8p-1
```

## 4. Control flow

Straight-line: a single early-out bounds check, then unconditional
computation and two stores. No loops. (The original wraps the body in a
degenerate one-iteration `switch`; the observable behavior is just
`if (out of range) return;`.)

## 5. Boundary behavior

- The only guard is `any(greaterThanEqual(p, imageSize(outF)))` — a *signed*
  comparison of `ivec2(gl_GlobalInvocationID.xy)` against **binding 48's**
  size. Both the store to 48 and the store to 49 rely on this one guard; the
  shader assumes binding 49 is at least as large as binding 48 (a dispatch
  sized for 48 can write out-of-range texels of a smaller 49 — such stores
  would be discarded by the implementation, but the shader itself does not
  check).
- `uv` is normalized by binding 32's LOD-0 size. If the output size exceeds
  the input size, or at border texels with the +-1 texel `ConstOffset`
  applied, sampling coordinates can leave the interior; addressing/edge
  behavior comes from the externally supplied samplers (offsets are applied
  to the unnormalized coordinate before the sampler's address mode).
- All six samplers are sampled at the same normalized `uv`; if bindings 33..37
  differ in resolution from binding 32, they are sampled at the proportional
  position (and offsets remain in their own texel units).

## 6. Precision requirements

Bit-exact reproduction requires:

- Sampling returns float32; convert each sampled vec4 to `f16vec4` before any
  arithmetic.
- All dots, adds, multiply-adds, clamps, matrix products and the final affine
  are fp16, in the association orders written in section 2.
- Widen to float32 only immediately before each `imageStore`; `rgba8`
  storage then clamps to [0,1] and quantizes each channel to unorm8.

## 7. Interpretation (non-normative)

This is a learned coarse-flow head: 18 feature-correlation costs over a 3x3
search neighborhood (two query descriptors against one reference), each cost
affinely squashed to [0,1], then two independent 18->4 fully-connected layers
(no nonlinearity other than the input clamps) whose 4-channel outputs are
rescaled into [0,1] for unorm8 storage. The meaning/packing of the 4 output
channels is not determinable from this shader alone.
