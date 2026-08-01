# shader_34 — 3×3 local correlation (cost volume) + two linear projection heads

## 1. Interface

- **Workgroup size**: 16 × 16 × 1 (`LocalSize 16 16 1`).
- Uses `gl_GlobalInvocationID` only. One thread = one output texel:
  `p = ivec2(gl_GlobalInvocationID.xy)`.
- Requires fp16 arithmetic (`Float16` capability). All dot products, affine
  maps and matrix products below are IEEE fp16.
- No UBO, no push constants, no spec constants, no shared memory.

Descriptors (all descriptor set 0). All samplers are 2D float, sampled with
`textureLod(..., 0.0)` (some with a constant texel offset — GLSL
`textureLodOffset`), never `texelFetch`:

| binding | kind | format | access | role (interpretation) |
|---|---|---|---|---|
| 32–35 | combined image sampler ×4 | — | read | feature set **A**: a 16-channel feature vector per pixel (4 RGBA textures). Sampled at the center only. Binding 32's size defines the UV normalization. |
| 36–39 | combined image sampler ×4 | — | read | feature set **B**: a second 16-channel feature vector per pixel. Center only. |
| 40–43 | combined image sampler ×4 | — | read | feature set **C**: 16-channel features sampled at all 9 taps of a 3×3 neighborhood. |
| 48 | storage image 2D | `Rgba8` | write-only (`NonReadable`) | output head 1 |
| 49 | storage image 2D | `Rgba8` | write-only (`NonReadable`) | output head 2 |

## 2. Coordinates and early-out

```
ivec2 p = ivec2(gl_GlobalInvocationID.xy);
if (p.x >= imageSize(out48).x || p.y >= imageSize(out48).y) return;   // signed compare
vec2 uv = (vec2(p) + 0.5) / vec2(textureSize(sampler_binding32, 0));
```

Every texture sample in the shader uses this single `uv` (LOD 0). The
guard tests only binding 48's size; binding 49 is written at the same `p`
unguarded against its own size (the two outputs are assumed same-sized).
`p` is never negative; there is no lower-bound guard. Samples with ±1 texel
offsets at image borders go to whatever the externally-configured sampler
address mode dictates — the shader does no clamping of its own.

## 3. Inputs

Let `f16s(tex, off)` denote `f16vec4(textureLodOffset(tex, uv, 0.0, off))`
and `f16s(tex)` the same without offset. Center vectors (each `f16vec4`):

```
a0 = f16s(tex32)   a1 = f16s(tex33)   a2 = f16s(tex34)   a3 = f16s(tex35)   // set A
b0 = f16s(tex36)   b1 = f16s(tex37)   b2 = f16s(tex38)   b3 = f16s(tex39)   // set B
```

Neighborhood vectors, for each tap offset `o`:
`c0(o) = f16s(tex40, o)`, `c1(o) = f16s(tex41, o)`, `c2(o) = f16s(tex42, o)`,
`c3(o) = f16s(tex43, o)` (the `o = (0,0)` tap uses the no-offset sample).

## 4. Correlation scores

For each of the 9 offsets, two 16-channel inner products (sum order is
left-to-right exactly as written; each `dot` is an fp16 4-component dot):

```
sA(o) = dot(a0, c0(o)) + dot(a1, c1(o)) + dot(a2, c2(o)) + dot(a3, c3(o))
sB(o) = dot(b0, c0(o)) + dot(b1, c1(o)) + dot(b2, c2(o)) + dot(b3, c3(o))
```

The 9 scores are grouped as (offsets are `(ox, oy)`, +x right, +y down):

```
gA1 = f16vec4(sA(-1,-1), sA(0,-1), sA(+1,-1), sA(-1,0))
gA2 = f16vec4(sA( 0, 0), sA(+1,0), sA(-1,+1), sA( 0,+1))
gA3 = sA(+1,+1)                       // scalar
gB1, gB2, gB3 analogously from sB.
```

## 5. Normalization (shared between A and B, per group)

Componentwise fp16 affine then clamp to [0,1]:

```
nA1 = clamp((gA1 - Z1) * S1 + O1, 0.0, 1.0)      nB1 = clamp((gB1 - Z1) * S1 + O1, 0.0, 1.0)
nA2 = clamp((gA2 - Z2) * S2 + O2, 0.0, 1.0)      nB2 = clamp((gB2 - Z2) * S2 + O2, 0.0, 1.0)
nA3 = clamp((gA3 - z3) * s3 + o3, 0.0, 1.0)      nB3 = clamp((gB3 - z3) * s3 + o3, 0.0, 1.0)
```

Constants (exact decimals of the underlying fp16 values):

```
Z1 = (4.31640625, 4.34375, 4.30859375, 4.35546875)
S1 = (0.1795654296875, 0.348388671875, 0.626953125, 0.36328125)
O1 = (0.2196044921875, 0.027496337890625, -0.63037109375, -0.004611968994140625)

Z2 = (4.421875, 4.33984375, 4.328125, 4.34375)
S2 = (0.2403564453125, 0.564453125, 0.521484375, 0.33349609375)
O2 = (0.1405029296875, -0.216552734375, -0.415283203125, 0.04852294921875)

z3 = 4.3046875        s3 = 0.380126953125        o3 = 0.0450439453125
```

## 6. Projection heads and outputs

`M · v` below means the standard column-matrix product
`M.col0*v.x + M.col1*v.y + M.col2*v.z + M.col3*v.w` (GLSL `f16mat4 * f16vec4`
with the columns as listed in §7). Accumulation order is exactly as written:

```
h1 = ((((P1·nA1 + P2·nA2) + q1*nA3) + P3·nB1) + P4·nB2) + q2*nB3
out48 value = (h1 - D0) * D1 + D2                       // componentwise, fp16
imageStore(out48, p, vec4(out48 value))                 // f16 -> f32 convert

h2 = ((((R1·nA1 + R2·nA2) + r1*nA3) + R3·nB1) + R4·nB2) + r2*nB3
out49 value = (h2 - E0) * E1 + E2
imageStore(out49, p, vec4(out49 value))
```

There is NO clamp before the stores; the `Rgba8` (unorm) format clamps to
[0,1] and quantizes to 8 bits at write time. Reproduce the value as-is and
let the storage format do the clamping.

## 7. Constants (all exact fp16 decimals; matrices given as 4 columns)

Head 1:

```
P1 col0 = ( 0.2120361328125,  0.10186767578125, -0.00580596923828125, -0.1025390625)
P1 col1 = ( 0.1046142578125,  0.2313232421875,  -0.2171630859375,     -0.2486572265625)
P1 col2 = ( 0.031768798828125, 0.0247802734375,  0.1446533203125,     -0.057586669921875)
P1 col3 = ( 0.17578125,        0.10382080078125, 0.33642578125,       -0.339111328125)

P2 col0 = ( 0.275634765625,  0.326171875,     -0.10076904296875, -0.63623046875)
P2 col1 = ( 0.154541015625,  0.0806884765625, -0.1961669921875,  -0.0672607421875)
P2 col2 = ( 0.091552734375,  0.269287109375,   0.11114501953125, -0.1405029296875)
P2 col3 = ( 0.248046875,    -0.223388671875,   0.1978759765625,  -0.294921875)

q1 = (0.013763427734375, -0.5341796875, 0.0024166107177734375, -0.2110595703125)

P3 col0 = ( 0.076416015625,  -0.21044921875,   -0.2861328125,   0.2242431640625)
P3 col1 = (-0.2344970703125,  0.51611328125,   -0.31103515625,  0.302734375)
P3 col2 = (-0.50341796875,    0.276611328125,   0.26708984375,  0.2529296875)
P3 col3 = (-0.174560546875,   0.10589599609375, 0.66748046875,  0.4013671875)

P4 col0 = (-1.0595703125,     0.40087890625,  -0.2958984375,  -0.1337890625)
P4 col1 = (-0.07440185546875, 0.26611328125,  -0.1875,         0.201416015625)
P4 col2 = (-0.291015625,      0.289794921875,  0.0615234375,   0.06060791015625)
P4 col3 = (-0.08892822265625, -0.716796875,    0.6728515625,   0.37451171875)

q2 = (-0.0297698974609375, -0.609375, -0.267822265625, 0.210205078125)

D0 = (-0.0872802734375, -0.0192108154296875, -0.018218994140625, -0.07098388671875)
D1 = ( 4.140625,          2.90625,             1.388671875,        6.20703125)
D2 = ( 0.24609375,       -0.2822265625,        0.427734375,        0.354248046875)
```

Head 2:

```
R1 col0 = (-0.11334228515625,  -0.5966796875,   -0.220703125,     -0.1552734375)
R1 col1 = ( 0.027679443359375, -0.15869140625,  -0.1466064453125, -0.219970703125)
R1 col2 = (-0.1318359375,       0.170166015625, -0.1160888671875,  0.08544921875)
R1 col3 = (-0.08880615234375,  -0.17041015625,  -0.0277099609375, -0.365478515625)

R2 col0 = ( 0.56396484375,   0.204833984375,    0.6162109375,          -0.414794921875)
R2 col1 = (-0.0650634765625, 0.4287109375,     -0.0005249977111816406, -0.089599609375)
R2 col2 = (-0.02532958984375, -0.0310516357421875, -0.303466796875,     0.2349853515625)
R2 col3 = ( 0.1968994140625,  0.2177734375,     -0.12322998046875,     -0.192626953125)

r1 = (0.1524658203125, 0.1317138671875, -0.2255859375, -0.155029296875)

R3 col0 = (-0.1258544921875, -0.53271484375,    0.0654296875,       -0.0849609375)
R3 col1 = (-0.12255859375,   -0.1435546875,    -0.281005859375,     -0.13232421875)
R3 col2 = (-0.035888671875,  -0.07440185546875, -0.07196044921875,   0.0215606689453125)
R3 col3 = (-0.08941650390625, -0.497802734375,  -0.059234619140625, -0.2252197265625)

R4 col0 = ( 1.1591796875,    -0.328857421875,  1.236328125,       -0.40087890625)
R4 col1 = (-0.1263427734375,  0.494873046875, -0.171630859375,    -0.0341796875)
R4 col2 = (-0.1104736328125, -0.0399169921875, -0.152099609375,    0.15087890625)
R4 col3 = ( 0.1806640625,     0.1837158203125,  0.025299072265625, -0.0479736328125)

r2 = (0.140380859375, 0.032562255859375, -0.11468505859375, 0.041717529296875)

E0 = ( 0.29736328125, -0.2337646484375, 0.121826171875, -0.376953125)
E1 = ( 1.20703125,     1.8583984375,    1.6904296875,    2.734375)
E2 = (-0.44287109375,  0.0650634765625, 0.2000732421875, -0.0643310546875)
```

## 8. Control flow summary

Straight-line: one early-out bounds check (§2), then all sampling and math,
then two unconditional stores. No loops.

## 9. Algorithmic intent (interpretation, not normative)

This computes a 3×3 local correlation (cost) volume: two 16-dim per-pixel
feature vectors (sets A and B — plausibly features of the two source frames,
or two warps) are each dotted against the 16-dim feature vectors of the 3×3
neighborhood of set C, giving 2×9 matching scores. The scores are
affine-rescaled into [0,1] (quantization-style normalization; note the near
constant subtrahend ≈ 4.3 ≈ the score mean) and passed through two per-pixel
linear layers (18 inputs → 4 outputs each) with a final dequant-style affine,
producing 8 output channels packed as two RGBA8 images.
