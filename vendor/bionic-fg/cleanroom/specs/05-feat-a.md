# shader_05 — half-res 3x3 conv, 1 input channel -> 4 feature channels

Source of truth: `asm/shader_05.spvasm`. One output texel per invocation.
Reads a single-channel input (only `.r` of the sampled texture is used) at 2x
the output resolution, applies a 3x3 convolution producing 4 channels, then an
output affine remap, and stores to an `rgba8` image.

(Interpretation, after the exact math below: this is a small CNN layer — input
normalization `(x - mean) * invStd + bias`, a 1-in/4-out 3x3 convolution, and
an output requantization affine so the result survives unorm8 storage.)

## 1. Interface

- Workgroup size: **16 x 16 x 1**. Uses `gl_GlobalInvocationID`.
- Descriptors, all set 0:

| binding | kind | format | access | role |
|---|---|---|---|---|
| 32 | combined image sampler, 2D float | (sampled) | read | input feature/luma image; only channel r is read |
| 48 | storage image 2D | `rgba8` | write-only (`NonReadable`) | output 4-channel feature map |

- No UBO, no push constants, no spec constants, no shared memory.
- FP16: all convolution arithmetic is IEEE half precision
  (`GL_EXT_shader_explicit_arithmetic_types_float16`).

## 2. Behavior

```
gid = ivec2(gl_GlobalInvocationID.xy)
if (any(greaterThanEqual(gid, imageSize(dst)))) return;    // early-out

srcSize = vec2(textureSize(src, 0))
uv = (vec2(gid * 2) + 0.5) / srcSize        // note the *2: output is half-res
```

Nine taps are taken with `textureLodOffset(src, uv, 0.0, off)` — constant
integer offsets applied in texel units by the sampling hardware at LOD 0.
For each tap, channel r is converted to fp16 and remapped:

```
t(off) = (float16_t(textureLodOffset(src, uv, 0.0, off).r) - C0) * C1 + C2
C0 = 0x1.aap-3  = 0.2080078125
C1 = 0x1.7fp+0  = 1.49609375
C2 = 0x1.8ap-1  = 0.76953125          // all fp16-exact
```

Accumulate (fp16, `f16vec4`), in exactly this tap order, `acc = Σ w(off) * t(off)`:

| # | off | weight vector w(off) = (r, g, b, a) | hex (fp16-exact) |
|---|---|---|---|
| 1 | (-1,-1) | (0.2138671875, -0.061798095703125, -0.2091064453125, -1.0029296875) | (0x1.b6p-3, -0x1.fa4p-5, -0x1.ac4p-3, -0x1.00cp+0) |
| 2 | (-1, 0) | (0.343994140625, -0.04486083984375, -0.327880859375, -0.62060546875) | (0x1.604p-2, -0x1.6f8p-5, -0x1.4fcp-2, -0x1.3dcp-1) |
| 3 | (-1, 1) | (0.1617431640625, -0.023727416992188, -0.16748046875, -0.256103515625) | (0x1.4b4p-3, -0x1.84cp-6, -0x1.57p-3, -0x1.064p-2) |
| 4 | ( 0,-1) | (0.34033203125, -0.0031566619873047, -0.315673828125, 0.0011692047119141) | (0x1.5c8p-2, -0x1.9dcp-9, -0x1.434p-2, 0x1.328p-10) |
| 5 | ( 0, 0) | (0.70654296875, 0.04998779296875, -0.666015625, 0.1534423828125) | (0x1.69cp-1, 0x1.998p-5, -0x1.55p-1, 0x1.3a4p-3) |
| 6 | ( 0, 1) | (0.441650390625, 0.060455322265625, -0.435546875, 0.2081298828125) | (0x1.c44p-2, 0x1.ef4p-5, -0x1.bep-2, 0x1.aa4p-3) |
| 7 | ( 1,-1) | (0.14453125, 0.0061836242675781, -0.154296875, -0.07080078125) | (0x1.28p-3, 0x1.954p-8, -0x1.3cp-3, -0x1.22p-4) |
| 8 | ( 1, 0) | (0.44677734375, 0.05987548828125, -0.418701171875, 0.0965576171875) | (0x1.c98p-2, 0x1.ea8p-5, -0x1.accp-2, 0x1.8b8p-4) |
| 9 | ( 1, 1) | (0.352783203125, 0.047119140625, -0.324951171875, 0.1416015625) | (0x1.694p-2, 0x1.82p-5, -0x1.4ccp-2, 0x1.22p-3) |

(The accumulation is sequential: `acc = w1*t1; acc += w2*t2; ... acc += w9*t9`.
Keep this association order for bit-exactness in fp16.)

Output affine (componentwise, fp16, exactly this operation order —
subtract, then multiply, then add):

```
out = (acc - B1) * G + B2

B1 = ( 2.408203125,   0.069763183593750, -2.306640625,     -1.0205078125)
   = ( 0x1.344p+1,    0x1.1dcp-4,        -0x1.274p+1,      -0x1.054p+0)
G  = ( 0.19494628906, 0.29223632812,      0.43359375,       0.6943359375)
   = ( 0x1.8f4p-3,    0x1.2b4p-2,         0x1.bcp-2,        0x1.638p-1)
B2 = ( 0.08825683594, -0.25756835938,    -0.18615722656,   -0.52392578125)
   = ( 0x1.698p-4,    -0x1.07cp-2,       -0x1.7d4p-3,      -0x1.0c4p-1)
```

Store: `imageStore(dst, gid, vec4(out))` (fp16 -> float32 conversion, then
unorm8 quantization by the `rgba8` format; values outside [0,1] clamp at
storage time per normal unorm rules).

Note the offset convention: the first offset component is x, the second y
(offset (-1,0) is the texel to the left).

## 3. Control flow

Straight-line except the single early-out at the top. No loops (the 9 taps
are fully unrolled).

## 4. Boundary behavior

- Out-of-range **writes** are prevented by the early return against
  `imageSize(dst)` only; no per-write guard.
- Sample coordinates are not clamped in shader math. With
  `imageSize(dst) == textureSize(src,0)/2` the +/-1 texel offsets still step
  outside the source at the borders; edge behavior is whatever the bound
  sampler's addressing mode provides. `uv` itself is in (0,1) for all in-range
  `gid` only if `dst` is at most half the source size in each dimension.
