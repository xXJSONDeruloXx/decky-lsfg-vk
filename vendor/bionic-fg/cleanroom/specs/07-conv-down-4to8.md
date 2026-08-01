# shader_07 — 3x3 stride-2 convolution, 4 -> 8 channels (encoder downsample)

Source of truth: the traced shader_07 disassembly (kept outside this
repository). One compute pass. It reads a 3x3 neighborhood from one sampled
RGBA image (which is at twice the output resolution), applies a fixed
(compiled-in) fp16 linear layer — a 3x3 convolution with stride 2, 4 input
channels (1 image x RGBA), 8 output channels — followed by a per-channel
affine remap, and stores the 8 output channels as two RGBA8 storage images at
the output resolution. It is the narrow (model-0) counterpart of shader_32:
same structure, half the input and output channels.

There is no UBO, no push constants, no spec constants, no shared memory, no
loops. The entire network layer's weights are literal constants in the shader.

## 1. Interface

- Workgroup size: **16 x 16 x 1**.
- Built-ins used: `gl_GlobalInvocationID` (only `.xy`; `.z` is ignored).
- All descriptors are in **set 0**:

| binding | kind | format | access | role |
|---|---|---|---|---|
| 32 | combined image sampler, 2D float | (sampled; format external) | read | input feature image (source of all 9 taps and of the size used for UV normalization) |
| 48 | storage image 2D | `rgba8` | write-only (`NonReadable`) | output channels 0-3; its size is also the bounds-check extent |
| 49 | storage image 2D | `rgba8` | write-only (`NonReadable`) | output channels 4-7 |

## 2. Behavior

Notation:

```
p       = ivec2(gl_GlobalInvocationID.xy)          // output texel
outSize = imageSize(out48)                          // binding 48 only
inSize  = vec2(textureSize(in32, 0))                // binding 32, level 0
uv      = (vec2(p * 2) + 0.5) / inSize
```

Early-out: if `p.x >= outSize.x || p.y >= outSize.y` (signed compare against
binding 48's size) the invocation returns without writing anything. Note the
UNSIGNED gid is bitcast to signed before the compare; no lower-bound check
exists (coordinates are non-negative by construction).

Note the sample coordinate: `p*2 + 0.5`, i.e. the center of input texel
`(2p.x, 2p.y)` — the *top-left* texel of the 2x2 block, not the block center.
Combined with the +-1 tap offsets below, the 3x3 window covers input texels
`2p + d, d in [-1..1]^2`, so with a nearest or linear sampler the taps are
exactly the texel values (the coordinate lands exactly on texel centers).

### 2.1 Taps

9 taps, each a `vec4` sampled with explicit LOD 0 and then converted to
fp16 (`f16vec4`):

```
t[k]  for k = 0..8 :  textureLodOffset(in32, uv, 0.0, D[k])   // binding 32
D = [(-1,-1), (-1,0), (-1,1), (0,-1), (0,0), (0,1), (1,-1), (1,0), (1,1)]
```

(the (0,0) tap uses no offset at all; the others use compile-time constant
offsets, i.e. `textureLodOffset`).

### 2.2 Per output image

For each output image `o` in {48, 49} there are 9 constant `f16mat4`
matrices `W[o][k]` (one per tap) and three constant `f16vec4`s `a[o]`, `b[o]`,
`c[o]`. The value written at `p` is:

```
sum   = W[o][0]*t[0] + W[o][1]*t[1] + ... + W[o][8]*t[8]       // f16vec4
v     = (sum - a[o]) * b[o] + c[o]                             // componentwise, fp16
store = vec4(v)                                                 // widen to fp32
imageStore(out_o, p, store)                                     // rgba8 unorm store
```

- `W*t` is the standard matrix-vector product: `(W*t)[i] = sum_j W[i][j]*t[j]`
  with `W[i][j]` given row-major in the appendix (section 6).
- All arithmetic (matrix products, the 8 additions, the affine) is IEEE fp16.
  The additions associate strictly left-to-right in tap order:
  `((W0*t0 + W1*t1) + W2*t2) + ...` — reproduce this order for bit-exactness.
- The `rgba8` store clamps each component to [0,1] and quantizes to unorm8;
  this clamp is the only nonlinearity in the pass.

Both outputs are written at the same coordinate `p` from the same 9 taps;
they differ only in their weight matrices and affine constants.

Interpretation (hint, not normative): this is one layer of a small
convolutional network — a stride-2 3x3 conv taking one RGBA feature map
(4 channels) to 8 channels packed as 2 RGBA8 images; `(x-a)*b+c` is a
per-channel affine that maps the fp16 activations into [0,1] for quantized
storage (a following layer presumably inverts it).

## 3. Control flow

- Single early-out bounds check (section 2), guarding everything.
- No loops, no other conditionals. The 9 taps and 2 output computations are
  straight-line code.

## 4. Boundary behavior

- Writes are guarded only by the check against binding 48's `imageSize`; the
  other output is assumed to be at least as large.
- Nothing clamps the sample UVs. For `p` on the image border the offset taps
  address input texels at -1 or `2*outSize` etc.; behavior comes from the
  externally supplied sampler's address mode. The shader itself does no
  clamping or edge handling.
- The shader relies on the dispatch to cover `outSize` (grid of
  ceil(outSize/16) workgroups); overhanging invocations self-terminate.

## 5. Precision requirements

Bit-exact reproduction requires:

- Sample results converted from fp32 to fp16 (round-to-nearest-even) before
  any arithmetic.
- All matrix/add/affine math in IEEE fp16
  (`GL_EXT_shader_explicit_arithmetic_types_float16`; `f16mat4`/`f16vec4`).
- The accumulation association order of section 2.2.
- Widen to fp32 only for the final `imageStore`.

In GLSL, build each `f16mat4` from the row-major tables in the appendix as
`f16mat4(col0, col1, col2, col3)` where `col_j = f16vec4(W[0][j], W[1][j],
W[2][j], W[3][j])` (GLSL matrix constructors take columns), then use plain
`M * t`.

## 6. Weights appendix

Layout: for each output binding, first the affine constants `a`, `b`, `c`
(as used in `v = (sum - a)*b + c`), then the 9 matrices keyed by
(input binding, tap offset). Each matrix is printed as 4 rows of 4 values,
row-major; each value is exact decimal followed by the exact fp16 hex-float
in parentheses. All values are exactly representable in fp16; both forms are
bit-exact.

All constants below were machine-extracted from the disassembly by script
(no manual transcription): every value was cross-checked against the shader's
constant declarations and verified to round-trip IEEE fp16 exactly — 312
values total (2 outputs x (9 matrices x 16 weights + 3 affine vectors x 4)).

### Output binding 48

Post-sum affine constants (see section 2):

- `a` = (0.80810546875, 0.72705078125, 0.82861328125, -0.250732421875)
  - hex: (0x1.9dcp-1, 0x1.744p-1, 0x1.a84p-1, -0x1.00cp-2)
- `b` = (0.34326171875, 0.457763671875, 0.292236328125, 0.3623046875)
  - hex: (0x1.5f8p-2, 0x1.d4cp-2, 0x1.2b4p-2, 0x1.73p-2)
- `c` = (0.256103515625, -0.1566162109375, 0.10400390625, 0.07696533203125)
  - hex: (0x1.064p-2, -0x1.40cp-3, 0x1.aap-4, 0x1.3b4p-4)

Tap: input binding 32, offset (-1,-1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  0.34619140625 (0x1.628p-2)  -0.32373046875 (-0x1.4b8p-2)  -0.07513427734375 (-0x1.33cp-4)  0.0306396484375 (0x1.f6p-6)
  -0.2236328125 (-0x1.cap-3)  0.08392333984375 (0x1.57cp-4)  -0.24169921875 (-0x1.efp-3)  0.1756591796875 (0x1.67cp-3)
  -0.1871337890625 (-0x1.7f4p-3)  0.214599609375 (0x1.b78p-3)  0.08349609375 (0x1.56p-4)  0.31640625 (0x1.44p-2)
  0.362548828125 (0x1.734p-2)  -0.412841796875 (-0x1.a6cp-2)  -0.1900634765625 (-0x1.854p-3)  0.23095703125 (0x1.d9p-3)
```

Tap: input binding 32, offset (-1,0) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  0.0340576171875 (0x1.17p-5)  -0.10888671875 (-0x1.bep-4)  -0.2281494140625 (-0x1.d34p-3)  0.0771484375 (0x1.3cp-4)
  -0.35498046875 (-0x1.6b8p-2)  0.09136962890625 (0x1.764p-4)  0.221923828125 (0x1.c68p-3)  0.04718017578125 (0x1.828p-5)
  0.2861328125 (0x1.25p-2)  0.07708740234375 (0x1.3bcp-4)  -0.2313232421875 (-0x1.d9cp-3)  0.18896484375 (0x1.83p-3)
  0.41552734375 (0x1.a98p-2)  -0.31591796875 (-0x1.438p-2)  -0.26220703125 (-0x1.0c8p-2)  -0.07513427734375 (-0x1.33cp-4)
```

Tap: input binding 32, offset (-1,1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  -0.2374267578125 (-0x1.e64p-3)  0.24560546875 (0x1.f7p-3)  0.2301025390625 (0x1.d74p-3)  -0.0036563873291015625 (-0x1.df4p-9)
  -0.11175537109375 (-0x1.c9cp-4)  0.2109375 (0x1.bp-3)  0.54345703125 (0x1.164p-1)  -0.11090087890625 (-0x1.c64p-4)
  0.32861328125 (0x1.508p-2)  -0.123046875 (-0x1.f8p-4)  0.0740966796875 (0x1.2f8p-4)  0.068115234375 (0x1.17p-4)
  -0.018798828125 (-0x1.34p-6)  0.1529541015625 (0x1.394p-3)  0.2232666015625 (0x1.c94p-3)  -0.267822265625 (-0x1.124p-2)
```

Tap: input binding 32, offset (0,-1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  -0.046478271484375 (-0x1.7ccp-5)  -0.150634765625 (-0x1.348p-3)  -0.25537109375 (-0x1.058p-2)  0.3662109375 (0x1.77p-2)
  -0.10601806640625 (-0x1.b24p-4)  0.27734375 (0x1.1cp-2)  -0.04437255859375 (-0x1.6b8p-5)  0.032073974609375 (0x1.06cp-5)
  0.343017578125 (0x1.5f4p-2)  0.1624755859375 (0x1.4ccp-3)  0.10723876953125 (0x1.b74p-4)  0.2039794921875 (0x1.a1cp-3)
  0.464599609375 (0x1.dbcp-2)  -0.1763916015625 (-0x1.694p-3)  -0.15185546875 (-0x1.37p-3)  0.2252197265625 (0x1.cd4p-3)
```

Tap: input binding 32, offset (0,0) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  0.0572509765625 (0x1.d5p-5)  0.3330078125 (0x1.55p-2)  -0.08526611328125 (-0x1.5d4p-4)  0.37890625 (0x1.84p-2)
  -0.03546142578125 (-0x1.228p-5)  0.2364501953125 (0x1.e44p-3)  0.275146484375 (0x1.19cp-2)  0.053558349609375 (0x1.b6cp-5)
  0.89208984375 (0x1.c8cp-1)  0.1944580078125 (0x1.8e4p-3)  -0.238037109375 (-0x1.e78p-3)  0.015625 (0x1p-6)
  0.63330078125 (0x1.444p-1)  -0.5634765625 (-0x1.208p-1)  -0.364013671875 (-0x1.74cp-2)  -0.017242431640625 (-0x1.1a8p-6)
```

Tap: input binding 32, offset (0,1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  -0.1185302734375 (-0x1.e58p-4)  0.71484375 (0x1.6ep-1)  0.48291015625 (0x1.ee8p-2)  0.181884765625 (0x1.748p-3)
  -0.054107666015625 (-0x1.bb4p-5)  0.395263671875 (0x1.94cp-2)  0.426513671875 (0x1.b4cp-2)  -0.10498046875 (-0x1.aep-4)
  0.457763671875 (0x1.d4cp-2)  0.035675048828125 (0x1.244p-5)  0.160888671875 (0x1.498p-3)  -0.1444091796875 (-0x1.27cp-3)
  0.450927734375 (0x1.cdcp-2)  -0.237060546875 (-0x1.e58p-3)  0.070556640625 (0x1.21p-4)  -0.23876953125 (-0x1.e9p-3)
```

Tap: input binding 32, offset (1,-1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  -0.213623046875 (-0x1.b58p-3)  0.10675048828125 (0x1.b54p-4)  -0.11419677734375 (-0x1.d3cp-4)  0.1695556640625 (0x1.5b4p-3)
  0.471923828125 (0x1.e34p-2)  0.191162109375 (0x1.878p-3)  -0.01025390625 (-0x1.5p-7)  -0.1617431640625 (-0x1.4b4p-3)
  0.51220703125 (0x1.064p-1)  0.007213592529296875 (0x1.d8cp-8)  0.032745361328125 (0x1.0c4p-5)  0.07147216796875 (0x1.24cp-4)
  0.019989013671875 (0x1.478p-6)  0.1661376953125 (0x1.544p-3)  0.13916015625 (0x1.1dp-3)  0.1263427734375 (0x1.02cp-3)
```

Tap: input binding 32, offset (1,0) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  0.146728515625 (0x1.2c8p-3)  0.46142578125 (0x1.d88p-2)  0.0233612060546875 (0x1.7ecp-6)  0.128173828125 (0x1.068p-3)
  0.43115234375 (0x1.b98p-2)  0.26171875 (0x1.0cp-2)  0.332763671875 (0x1.54cp-2)  -0.1422119140625 (-0x1.234p-3)
  0.89892578125 (0x1.cc4p-1)  0.035125732421875 (0x1.1fcp-5)  -0.3349609375 (-0x1.57p-2)  -0.2086181640625 (-0x1.ab4p-3)
  0.2255859375 (0x1.cep-3)  -0.299072265625 (-0x1.324p-2)  -0.30615234375 (-0x1.398p-2)  0.03857421875 (0x1.3cp-5)
```

Tap: input binding 32, offset (1,1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  0.137451171875 (0x1.198p-3)  0.759765625 (0x1.85p-1)  0.54052734375 (0x1.14cp-1)  -0.0675048828125 (-0x1.148p-4)
  0.2939453125 (0x1.2dp-2)  0.056671142578125 (0x1.d04p-5)  0.247802734375 (0x1.fb8p-3)  -0.1826171875 (-0x1.76p-3)
  0.250732421875 (0x1.00cp-2)  0.035003662109375 (0x1.1ecp-5)  0.10357666015625 (0x1.a84p-4)  -0.34423828125 (-0x1.608p-2)
  0.270751953125 (0x1.154p-2)  -0.323486328125 (-0x1.4b4p-2)  -0.0823974609375 (-0x1.518p-4)  -0.115234375 (-0x1.d8p-4)
```

### Output binding 49

Post-sum affine constants (see section 2):

- `a` = (0.3017578125, 0.01161956787109375, -0.78759765625, 1.0009765625)
  - hex: (0x1.35p-2, 0x1.7ccp-7, -0x1.934p-1, 0x1.004p+0)
- `b` = (0.4638671875, 0.5078125, 0.44775390625, 0.30126953125)
  - hex: (0x1.dbp-2, 0x1.04p-1, 0x1.ca8p-2, 0x1.348p-2)
- `c` = (0.0196685791015625, -0.02593994140625, -0.006587982177734375, 0.1923828125)
  - hex: (0x1.424p-6, -0x1.a9p-6, -0x1.afcp-8, 0x1.8ap-3)

Tap: input binding 32, offset (-1,-1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  -0.450927734375 (-0x1.cdcp-2)  0.47802734375 (0x1.e98p-2)  0.23779296875 (0x1.e7p-3)  0.04095458984375 (0x1.4f8p-5)
  0.1409912109375 (0x1.20cp-3)  0.0416259765625 (0x1.55p-5)  -0.01399993896484375 (-0x1.cacp-7)  -0.0168609619140625 (-0x1.144p-6)
  -0.310302734375 (-0x1.3dcp-2)  -0.187255859375 (-0x1.7f8p-3)  -0.10882568359375 (-0x1.bdcp-4)  -0.06378173828125 (-0x1.054p-4)
  0.3994140625 (0x1.99p-2)  0.1317138671875 (0x1.0dcp-3)  -0.1307373046875 (-0x1.0bcp-3)  0.34765625 (0x1.64p-2)
```

Tap: input binding 32, offset (-1,0) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  -0.2900390625 (-0x1.29p-2)  0.2386474609375 (0x1.e8cp-3)  0.1495361328125 (0x1.324p-3)  0.28515625 (0x1.24p-2)
  0.472412109375 (0x1.e3cp-2)  -0.272216796875 (-0x1.16cp-2)  -0.09075927734375 (-0x1.73cp-4)  -0.038909912109375 (-0x1.3ecp-5)
  -0.5703125 (-0x1.24p-1)  0.06304931640625 (0x1.024p-4)  -0.1265869140625 (-0x1.034p-3)  -0.131103515625 (-0x1.0c8p-3)
  0.134033203125 (0x1.128p-3)  0.5947265625 (0x1.308p-1)  0.4423828125 (0x1.c5p-2)  0.140625 (0x1.2p-3)
```

Tap: input binding 32, offset (-1,1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  0.1939697265625 (0x1.8d4p-3)  -0.240966796875 (-0x1.ed8p-3)  -0.17333984375 (-0x1.63p-3)  0.456787109375 (0x1.d3cp-2)
  0.436767578125 (0x1.bf4p-2)  -0.321533203125 (-0x1.494p-2)  -0.09564208984375 (-0x1.87cp-4)  -0.21337890625 (-0x1.b5p-3)
  -0.6943359375 (-0x1.638p-1)  0.1651611328125 (0x1.524p-3)  0.250732421875 (0x1.00cp-2)  -0.0001180171966552734375 (-0x1.efp-14)
  -0.0165863037109375 (-0x1.0fcp-6)  0.1092529296875 (0x1.bf8p-4)  0.338623046875 (0x1.5acp-2)  0.085205078125 (0x1.5dp-4)
```

Tap: input binding 32, offset (0,-1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  -0.354736328125 (-0x1.6b4p-2)  0.12384033203125 (0x1.fb4p-4)  0.10650634765625 (0x1.b44p-4)  -0.246826171875 (-0x1.f98p-3)
  -0.53759765625 (-0x1.134p-1)  0.450927734375 (0x1.cdcp-2)  0.2237548828125 (0x1.ca4p-3)  0.018096923828125 (0x1.288p-6)
  -0.603515625 (-0x1.35p-1)  0.08929443359375 (0x1.6dcp-4)  -0.1639404296875 (-0x1.4fcp-3)  -0.0167388916015625 (-0x1.124p-6)
  0.6923828125 (0x1.628p-1)  0.343017578125 (0x1.5f4p-2)  0.12890625 (0x1.08p-3)  0.10601806640625 (0x1.b24p-4)
```

Tap: input binding 32, offset (0,0) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  -0.6826171875 (-0x1.5d8p-1)  0.6103515625 (0x1.388p-1)  0.373779296875 (0x1.7ecp-2)  -0.051361083984375 (-0x1.a4cp-5)
  -0.17041015625 (-0x1.5dp-3)  0.08642578125 (0x1.62p-4)  0.14599609375 (0x1.2bp-3)  0.1082763671875 (0x1.bb8p-4)
  -1 (-0x1p+0)  0.07745361328125 (0x1.3d4p-4)  0.0030536651611328125 (0x1.904p-9)  -0.0721435546875 (-0x1.278p-4)
  0.445556640625 (0x1.c84p-2)  0.4375 (0x1.cp-2)  0.5068359375 (0x1.038p-1)  -0.149169921875 (-0x1.318p-3)
```

Tap: input binding 32, offset (0,1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  -0.482666015625 (-0x1.ee4p-2)  0.26513671875 (0x1.0f8p-2)  0.01073455810546875 (0x1.5fcp-7)  0.201416015625 (0x1.9c8p-3)
  0.252197265625 (0x1.024p-2)  -0.3486328125 (-0x1.65p-2)  -0.1729736328125 (-0x1.624p-3)  0.0531005859375 (0x1.b3p-5)
  -0.6640625 (-0x1.54p-1)  -0.061737060546875 (-0x1.f9cp-5)  0.273193359375 (0x1.17cp-2)  0.01151275634765625 (0x1.794p-7)
  0.04486083984375 (0x1.6f8p-5)  -0.052520751953125 (-0x1.ae4p-5)  0.34619140625 (0x1.628p-2)  -0.0821533203125 (-0x1.508p-4)
```

Tap: input binding 32, offset (1,-1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  0.427001953125 (0x1.b54p-2)  -0.27099609375 (-0x1.158p-2)  -0.2119140625 (-0x1.b2p-3)  -0.34130859375 (-0x1.5d8p-2)
  -0.433349609375 (-0x1.bbcp-2)  0.191650390625 (0x1.888p-3)  0.10235595703125 (0x1.a34p-4)  -0.10516357421875 (-0x1.aecp-4)
  -0.51171875 (-0x1.06p-1)  0.280029296875 (0x1.1ecp-2)  -0.01012420654296875 (-0x1.4bcp-7)  -0.0034084320068359375 (-0x1.becp-9)
  -0.05755615234375 (-0x1.d78p-5)  0.11322021484375 (0x1.cfcp-4)  0.1451416015625 (0x1.294p-3)  0.003177642822265625 (0x1.a08p-9)
```

Tap: input binding 32, offset (1,0) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  0.09271240234375 (0x1.7bcp-4)  0.1824951171875 (0x1.75cp-3)  0.0770263671875 (0x1.3b8p-4)  -0.2298583984375 (-0x1.d6cp-3)
  -0.7099609375 (-0x1.6b8p-1)  0.4560546875 (0x1.d3p-2)  0.29248046875 (0x1.2b8p-2)  0.0947265625 (0x1.84p-4)
  -0.5634765625 (-0x1.208p-1)  0.147216796875 (0x1.2d8p-3)  -0.0145111083984375 (-0x1.db8p-7)  -0.028839111328125 (-0x1.d88p-6)
  -0.11505126953125 (-0x1.d74p-4)  0.154541015625 (0x1.3c8p-3)  0.2216796875 (0x1.c6p-3)  -0.229736328125 (-0x1.d68p-3)
```

Tap: input binding 32, offset (1,1) — W rows (row-major, `contrib[i] = sum_j W[i][j]*tap[j]`):

```
  -0.151611328125 (-0x1.368p-3)  0.273681640625 (0x1.184p-2)  0.00514984130859375 (0x1.518p-8)  0.00307464599609375 (0x1.93p-9)
  -0.4248046875 (-0x1.b3p-2)  0.165283203125 (0x1.528p-3)  -0.10418701171875 (-0x1.aacp-4)  0.1697998046875 (0x1.5bcp-3)
  -0.548828125 (-0x1.19p-1)  -0.21728515625 (-0x1.bdp-3)  0.1673583984375 (0x1.56cp-3)  0.10076904296875 (0x1.9ccp-4)
  -0.059906005859375 (-0x1.eacp-5)  -0.0153045654296875 (-0x1.f58p-7)  0.191162109375 (0x1.878p-3)  -0.00913238525390625 (-0x1.2b4p-7)
```
