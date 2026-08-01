# shader_13 / shader_38 — masked sigmoid map + 5-level box pyramid ("flow pyramid" family)

One spec covers both shaders. The two binaries are structurally identical
(verified by diffing the disassembly with SSA ids normalized): they differ
ONLY in the 18 four-component convolution weight vectors and the scalar bias
listed in the Family parameters section. Everything else below applies to
both verbatim.

## 1. Interface

- **Workgroup size**: 16 × 16 × 1 (`LocalSize 16 16 1`).
- Uses `gl_WorkGroupID` and `gl_LocalInvocationID` (NOT `gl_GlobalInvocationID`).
- Requires fp16 arithmetic (`Float16` capability); all convolution/reduction
  arithmetic is IEEE fp16 (GLSL: `float16_t` via
  `GL_EXT_shader_explicit_arithmetic_types_float16`).

Descriptors (all descriptor set 0):

| binding | kind | format | access | role |
|---|---|---|---|---|
| 0  | UBO | struct { float @0; float @4; float @8 } | read | only member 2 (offset 8) is read; used as a threshold ("maskThreshold"). Members 0 and 1 are declared but never read by this shader. |
| 32 | combined image sampler, 2D float | — | read (texelFetch only) | input A ("merged flow"); its size defines the level-0 grid and the fetch clamp |
| 33 | combined image sampler, 2D float | — | read (texelFetch only) | input B ("feature map"); fetched at coordinates clamped against input A's size — assumed same dimensions as A |
| 48 | storage image 2D | `R8` | write-only (`NonReadable`) | output level 0 (full resolution) |
| 49 | storage image 2D | `R8` | write-only | output level 1 (½ res) |
| 50 | storage image 2D | `R8` | write-only | output level 2 (¼ res) |
| 51 | storage image 2D | `R8` | write-only | output level 3 (⅛ res) |
| 52 | storage image 2D | `R8` | write-only | output level 4 (1/16 res) |
| 53 | storage image 2D | `R8` | write-only | output level 5 (1/32 res) |

No push constants. No spec constants.

Shared memory: one `32 × 32` array of fp16, referred to below as `S[x][y]`
(first index = x). GLSL: `shared float16_t S[32][32];` indexed `S[x][y]`.

## 2. Dispatch geometry

Each workgroup produces one 32×32 tile of level 0: each of the 16×16 threads
computes a 2×2 block. Dispatch must be `ceil(W0/32) × ceil(H0/32) × 1`
workgroups, where `W0 × H0 = imageSize(level0 output)`. All out-of-range
writes are guarded inside the shader (see §5), so partial edge tiles are fine.

Let `wg = gl_WorkGroupID.xy`, `lid = gl_LocalInvocationID.xy` (both uvec2).

## 3. Phase 1 — per-texel value (level 0)

Executed by every thread for its 2×2 block, as two nested loops:

```
for (uint dy = 0; dy < 2; ++dy)        // outer loop
  for (uint dx = 0; dx < 2; ++dx) {    // inner loop
    ivec2 p = ivec2(wg*32u + lid*2u + uvec2(dx, dy));
    ... compute v(p) ... (below)
  }
```

Let `texA` = binding 32, `texB` = binding 33, and

```
ivec2 hiA = ivec2(vec2(textureSize(texA, 0))) - ivec2(1);   // size-1, via a
                                                            // float round-trip
                                                            // (exact for any
                                                            // realistic size)
q(o) = clamp(p + o, ivec2(0), hiA)      // componentwise, o = tap offset
```

The nine tap offsets, in the exact accumulation order used:

```
o1..o9 = (-1,-1), (-1,0), (-1,+1), (0,-1), (0,0), (0,+1), (+1,-1), (+1,0), (+1,+1)
```

(offsets are `(ox, oy)`; +x = right, +y = down in texel space).

Per-texel score (all in fp16; each `texelFetch` result — a `vec4` — is
converted to `f16vec4` before the dot product; additions are performed
strictly left-to-right in the order written):

```
s = dot(f16(texelFetch(texA, q(o1), 0)), WA[1]) + ... + dot(f16(texelFetch(texA, q(o9), 0)), WA[9])
  + dot(f16(texelFetch(texB, q(o1), 0)), WB[1]) + ... + dot(f16(texelFetch(texB, q(o9), 0)), WB[9])
  + bias
```

Note: the `texB` fetches reuse the SAME clamped coordinates `q(o)` (clamped
against `texA`'s size). `WA[i]`, `WB[i]`, `bias` are the per-shader constants
in §7.

Sigmoid, then threshold gate (fp16):

```
m   = 1.0h / (1.0h + exp(-s))
thr = float16_t(ubo.member2)            // UBO offset 8, converted f32 -> f16
v   = step(thr, m) * m                  // i.e. (m >= thr) ? m : 0.0h
```

Writes:

- If `p.x < imageSize(level0).x && p.y < imageSize(level0).y` (signed
  compare; p is always ≥ 0): `imageStore(level0, p, vec4(float(v)))`.
  Level-0 image is `R8` (unorm) — only the red channel lands; `v ∈ (0,1)` or 0
  so the unorm clamp never alters it.
- Unconditionally: `S[lid.x*2 + dx][lid.y*2 + dy] = v`. (Out-of-image texels
  of a partial edge tile still get computed — from clamped fetches — and DO
  contribute to the coarser-level averages below. Reproduce this.)

## 4. Phases 2–6 — box-filter reduction pyramid

Five identical reduction rounds with `n = 16, 8, 4, 2, 1` writing to bindings
49, 50, 51, 52, 53 respectively. Each round:

```
barrier();                              // workgroup control barrier +
                                        // shared-memory acquire/release
if (lid.x < n && lid.y < n) {
    float16_t v = 0.25h * (((S[2*lid.x  ][2*lid.y  ]
                           + S[2*lid.x+1][2*lid.y  ])
                           + S[2*lid.x  ][2*lid.y+1])
                           + S[2*lid.x+1][2*lid.y+1]);
    ivec2 c = ivec2(wg * n + lid);
    if (c.x < imageSize(out_n).x && c.y < imageSize(out_n).y)
        imageStore(out_n, c, vec4(float(v)));
    S[lid.x][lid.y] = v;
}
```

Notes:
- For `n = 16` the `lid < n` test is trivially true (every thread runs it);
  it is still present in the original.
- The additions inside the average are performed in exactly the parenthesized
  order shown; the 0.25 multiply is exact.
- The in-place update `S[lid.x][lid.y] = v` is safe because for every active
  thread `lid < n`, the cells it reads (`indices ≥ 2*lid`) are only written by
  threads that read from even coarser cells; each round is separated by a
  barrier.
- There is NO barrier after the final (n = 1) round; the shader simply ends.

## 5. Boundary behavior summary

- Reads: fetch coordinates are always clamped to `[0, sizeA-1]`
  componentwise; nothing is ever fetched out of range. (No sampler math —
  `texelFetch` only, LOD 0.)
- Writes: every `imageStore` is guarded by a signed `<` test against the
  *destination* image's own `imageSize()` (upper bound only; coordinates are
  non-negative by construction).
- Level sizes are queried independently per level; the shader does not assume
  exact halving, but the coordinate scheme (`wg*n + lid`) is only meaningful
  when level k has size `ceil`-halved from level k-1.

## 6. Algorithmic intent (interpretation, not normative)

This is a 3×3 convolution over 8 input channels (two RGBA textures) → 1
channel, plus bias, followed by a logistic sigmoid and a hard threshold gate
(values below `ubo.member2` are zeroed) — i.e. a learned single-channel mask
(plausibly occlusion/confidence for flow merging) — then a standard 2×
box-filter mip pyramid of that mask, 6 levels total, produced in one dispatch
via shared memory.

## 7. Family parameters (the ONLY differences between shader_13 and shader_38)

All values are IEEE fp16 constants; both the hex-float literal (bit-exact)
and its exact decimal are given. `WA[i]`/`WB[i]` component order = (r,g,b,a)
of the fetched texel.

### shader_13

bias = `0x1.b9p-3` (0.21533203125)

| set | tap (ox,oy) | w.r | w.g | w.b | w.a |
|---|---|---|---|---|---|
| A | (-1,-1) | 0x1.6b4p-1 (0.70947265625) | -0x1.a54p-2 (-0.411376953125) | -0x1.bdcp-2 (-0.435302734375) | -0x1.2ap-1 (-0.58203125) |
| A | (-1, 0) | 0x1.594p-1 (0.67431640625) | -0x1.308p-2 (-0.29736328125) | -0x1.f14p-2 (-0.485595703125) | -0x1.154p+0 (-1.0830078125) |
| A | (-1,+1) | 0x1.1c4p+0 (1.1103515625) | -0x1.2cp-1 (-0.5859375) | -0x1.46p-1 (-0.63671875) | -0x1.2bp+0 (-1.16796875) |
| A | ( 0,-1) | 0x1.438p-2 (0.31591796875) | -0x1.d2p-2 (-0.455078125) | -0x1.264p-1 (-0.57470703125) | -0x1.c44p-1 (-0.88330078125) |
| A | ( 0, 0) | 0x1.db8p-3 (0.232177734375) | -0x1.be8p-3 (-0.218017578125) | -0x1.07cp-1 (-0.51513671875) | -0x1.9ccp+0 (-1.6123046875) |
| A | ( 0,+1) | 0x1.6acp-1 (0.70849609375) | -0x1.018p-1 (-0.5029296875) | -0x1.44p-1 (-0.6328125) | -0x1.a1p+0 (-1.62890625) |
| A | (+1,-1) | 0x1.b38p-1 (0.8505859375) | -0x1.61p-1 (-0.689453125) | -0x1.c1cp-1 (-0.87841796875) | -0x1.704p-1 (-0.71923828125) |
| A | (+1, 0) | 0x1.6dp-1 (0.712890625) | -0x1.10cp-1 (-0.53271484375) | -0x1.87cp-1 (-0.76513671875) | -0x1.cc4p-1 (-0.89892578125) |
| A | (+1,+1) | 0x1.1dp+0 (1.11328125) | -0x1.87p-1 (-0.763671875) | -0x1.c0cp-1 (-0.87646484375) | -0x1.2a8p+0 (-1.166015625) |
| B | (-1,-1) | -0x1.888p-1 (-0.7666015625) | 0x1.ba8p-1 (0.8642578125) | -0x1.14cp-1 (-0.54052734375) | 0x1.0ap-1 (0.51953125) |
| B | (-1, 0) | -0x1.ec4p-1 (-0.96142578125) | 0x1.77cp-1 (0.73388671875) | -0x1.3d8p-1 (-0.6201171875) | 0x1.3p-1 (0.59375) |
| B | (-1,+1) | -0x1.614p+0 (-1.3798828125) | 0x1.da4p-1 (0.92626953125) | -0x1.8dcp-1 (-0.77685546875) | 0x1.754p-1 (0.72900390625) |
| B | ( 0,-1) | -0x1.39cp-1 (-0.61279296875) | 0x1.548p-1 (0.6650390625) | -0x1.378p-1 (-0.6083984375) | 0x1.44cp-1 (0.63427734375) |
| B | ( 0, 0) | -0x1.eap-2 (-0.478515625) | 0x1.bacp-2 (0.432373046875) | -0x1.464p-1 (-0.63720703125) | 0x1.3a8p-1 (0.6142578125) |
| B | ( 0,+1) | -0x1.9fp-1 (-0.810546875) | 0x1.2ep-1 (0.58984375) | -0x1.67cp-1 (-0.70263671875) | 0x1.7ep-1 (0.74609375) |
| B | (+1,-1) | -0x1.28p+0 (-1.15625) | 0x1.a8cp-1 (0.82958984375) | -0x1.a38p-1 (-0.8193359375) | 0x1.ad8p-1 (0.8388671875) |
| B | (+1, 0) | -0x1.f3cp-1 (-0.97607421875) | 0x1.58cp-1 (0.67333984375) | -0x1.99p-1 (-0.798828125) | 0x1.a78p-1 (0.8271484375) |
| B | (+1,+1) | -0x1.4cp+0 (-1.296875) | 0x1.ad8p-1 (0.8388671875) | -0x1.968p-1 (-0.7939453125) | 0x1.eep-1 (0.96484375) |

### shader_38

bias = `-0x1.5d4p+0` (-1.3642578125)

| set | tap (ox,oy) | w.r | w.g | w.b | w.a |
|---|---|---|---|---|---|
| A | (-1,-1) | 0x1.f3cp-4 (0.12200927734375) | 0x1.29p-1 (0.580078125) | 0x1.d04p-1 (0.90673828125) | 0x1.06cp-1 (0.51318359375) |
| A | (-1, 0) | 0x1.b8p-2 (0.4296875) | 0x1.6d8p-2 (0.35693359375) | 0x1.1ccp-1 (0.55615234375) | 0x1.0e8p-1 (0.5283203125) |
| A | (-1,+1) | 0x1.d6cp-2 (0.459716796875) | 0x1.f64p-2 (0.490478515625) | 0x1.55p-1 (0.666015625) | 0x1.814p-1 (0.75244140625) |
| A | ( 0,-1) | 0x1.088p-3 (0.129150390625) | 0x1.fep-2 (0.498046875) | 0x1.26cp-1 (0.57568359375) | 0x1.164p-3 (0.1358642578125) |
| A | ( 0, 0) | 0x1.adp-2 (0.4189453125) | 0x1.8bp-3 (0.19287109375) | 0x1.50cp-3 (0.1644287109375) | 0x1.cd4p-3 (0.2252197265625) |
| A | ( 0,+1) | 0x1.e1p-2 (0.4697265625) | 0x1.c8p-2 (0.4453125) | 0x1.dcp-2 (0.46484375) | 0x1.0b8p-1 (0.5224609375) |
| A | (+1,-1) | 0x1.014p-2 (0.251220703125) | 0x1.1dcp-1 (0.55810546875) | 0x1.668p-1 (0.7001953125) | 0x1.678p-2 (0.35107421875) |
| A | (+1, 0) | 0x1.2ccp-1 (0.58740234375) | 0x1.d44p-2 (0.457275390625) | 0x1.eecp-2 (0.483154296875) | 0x1.504p-1 (0.65673828125) |
| A | (+1,+1) | 0x1.ddp-2 (0.4658203125) | 0x1.fecp-2 (0.498779296875) | 0x1.208p-1 (0.5634765625) | 0x1.64p-1 (0.6953125) |
| B | (-1,-1) | 0x1.194p-1 (0.54931640625) | 0x1.52cp-1 (0.66162109375) | -0x1.c9p-1 (-0.892578125) | -0x1.314p+0 (-1.1923828125) |
| B | (-1, 0) | 0x1.e44p-2 (0.472900390625) | 0x1.d44p-2 (0.457275390625) | -0x1.c7cp-1 (-0.89013671875) | -0x1.1f8p+0 (-1.123046875) |
| B | (-1,+1) | 0x1.e48p-2 (0.47314453125) | 0x1.154p-1 (0.54150390625) | -0x1.2b4p+0 (-1.1689453125) | -0x1.39p+0 (-1.22265625) |
| B | ( 0,-1) | 0x1.bd8p-2 (0.43505859375) | 0x1.bdcp-2 (0.435302734375) | -0x1.bp-1 (-0.84375) | -0x1.034p+0 (-1.0126953125) |
| B | ( 0, 0) | 0x1.02p-2 (0.251953125) | 0x1.58cp-3 (0.1683349609375) | -0x1.c08p-1 (-0.8759765625) | -0x1.e4cp-1 (-0.94677734375) |
| B | ( 0,+1) | 0x1.82cp-2 (0.377685546875) | 0x1.a04p-2 (0.406494140625) | -0x1.188p+0 (-1.095703125) | -0x1.208p+0 (-1.126953125) |
| B | (+1,-1) | 0x1.76p-2 (0.365234375) | 0x1.cap-2 (0.447265625) | -0x1.384p+0 (-1.2197265625) | -0x1.204p+0 (-1.1259765625) |
| B | (+1, 0) | 0x1.604p-2 (0.343994140625) | 0x1.adp-2 (0.4189453125) | -0x1.2a4p+0 (-1.1650390625) | -0x1.228p+0 (-1.134765625) |
| B | (+1,+1) | 0x1.6ccp-2 (0.356201171875) | 0x1.d3cp-2 (0.456787109375) | -0x1.4d4p+0 (-1.3017578125) | -0x1.4e4p+0 (-1.3056640625) |
