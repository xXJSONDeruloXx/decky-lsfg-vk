# shader_30 — half-res 3x3 conv, 1 input channel -> 8 output channels (two rgba8 images)

Source of truth: `asm/shader_30.spvasm`. One invocation produces one texel in
EACH of two output images. Reads a single-channel input (only `.r` used) at 2x
the output resolution, applies a per-tap scalar affine, then two independent
4-channel 3x3 convolutions sharing the same nine remapped taps, each followed
by its own output affine.

(Interpretation, after the exact math: a 1-in/8-out 3x3 CNN layer whose 8
output channels are split across two `rgba8` images, with input normalization
and per-image output requantization affines. Same structural template as
shader_05 but with a second head. Host context calls this pass "flow expand".)

## 1. Interface

- Workgroup size: **16 x 16 x 1**. Uses `gl_GlobalInvocationID`.
- Descriptors, all set 0:

| binding | kind | format | access | role |
|---|---|---|---|---|
| 32 | combined image sampler, 2D float | (sampled) | read | input image; only channel r read |
| 48 | storage image 2D | `rgba8` | write-only (`NonReadable`) | output A (channels 0-3) |
| 49 | storage image 2D | `rgba8` | write-only (`NonReadable`) | output B (channels 4-7) |

- No UBO, no push constants, no spec constants, no shared memory.
- FP16 arithmetic throughout (`GL_EXT_shader_explicit_arithmetic_types_float16`).

## 2. Behavior

```
gid = ivec2(gl_GlobalInvocationID.xy)
if (any(greaterThanEqual(gid, imageSize(dstA)))) return;   // checks dstA (binding 48) ONLY

srcSize = vec2(textureSize(src, 0))
uv = (vec2(gid * 2) + 0.5) / srcSize                       // output is half-res of src
```

### 2.1 Taps

Nine samples with `textureLodOffset(src, uv, 0.0, off)` (LOD 0, constant
texel offsets; first offset component is x, second y), channel r only,
converted to fp16 and remapped by scalar affine (subtract, multiply, add):

```
t(off) = (float16_t(sample.r) - C0) * C1 + C2
C0 = 0x1.4ap-2  = 0.322265625
C1 = 0x1.798p-1 = 0.7373046875
C2 = 0x1.0ccp-1 = 0.52490234375        // fp16-exact
```

Tap order (used for both accumulations):
1. (-1,-1)  2. (-1,0)  3. (-1,1)  4. (0,-1)  5. (0,0)  6. (0,1)
7. (1,-1)  8. (1,0)  9. (1,1)

### 2.2 Output A (binding 48)

`accA = Σ_k wA_k * t_k` accumulated sequentially in tap order (fp16,
`f16vec4`; keep association order):

| # | off | wA_k = (r, g, b, a) | hex (fp16-exact) |
|---|---|---|---|
| 1 | (-1,-1) | (-0.065368652344, 0.36206054688, 0.066772460938, 0.050598144531) | (-0x1.0bcp-4, 0x1.72cp-2, 0x1.118p-4, 0x1.9e8p-5) |
| 2 | (-1, 0) | (-0.019653320312, 0.31518554688, 0.010818481445, -0.071228027344) | (-0x1.42p-6, 0x1.42cp-2, 0x1.628p-7, -0x1.23cp-4) |
| 3 | (-1, 1) | (-0.061187744141, 0.12493896484, 0.068176269531, -0.13073730469) | (-0x1.f54p-5, 0x1.ffcp-4, 0x1.174p-4, -0x1.0bcp-3) |
| 4 | ( 0,-1) | (0.0045356750488, 0.13244628906, -0.0047492980957, 0.018783569336) | (0x1.294p-8, 0x1.0f4p-3, -0x1.374p-8, 0x1.33cp-6) |
| 5 | ( 0, 0) | (0.10791015625, 0.24694824219, -0.18420410156, -0.098266601562) | (0x1.bap-4, 0x1.f9cp-3, -0x1.794p-3, -0x1.928p-4) |
| 6 | ( 0, 1) | (0.019195556641, -0.091735839844, -0.057739257812, -0.216796875) | (0x1.3a8p-6, -0x1.77cp-4, -0x1.d9p-5, -0x1.bcp-3) |
| 7 | ( 1,-1) | (0.079284667969, -0.16540527344, -0.15991210938, 0.10046386719) | (0x1.44cp-4, -0x1.52cp-3, -0x1.478p-3, 0x1.9b8p-4) |
| 8 | ( 1, 0) | (0.2138671875, -0.064392089844, -0.31640625, 0.03125) | (0x1.b6p-3, -0x1.07cp-4, -0x1.44p-2, 0x1p-5) |
| 9 | ( 1, 1) | (0.084716796875, -0.36279296875, -0.11651611328, -0.089111328125) | (0x1.5bp-4, -0x1.738p-2, -0x1.dd4p-4, -0x1.6dp-4) |

Output affine (componentwise fp16; subtract, multiply, add):

```
outA = (accA - B1A) * GA + B2A
B1A = (0.19067382812, 0.2578125, -0.36328125, -0.21069335938)
    = (0x1.868p-3, 0x1.08p-2, -0x1.74p-2, -0x1.af8p-3)
GA  = (3.42578125, 1.4599609375, 5.015625, 5.2734375)
    = (0x1.b68p+1, 0x1.75cp+0, 0x1.41p+2, 0x1.518p+2)
B2A = (0.098510742188, 0.30712890625, -0.28100585938, -0.23095703125)
    = (0x1.938p-4, 0x1.3a8p-2, -0x1.1fcp-2, -0x1.d9p-3)
```

`imageStore(dstA, gid, vec4(outA))` (fp16 -> float32, unorm8 quantize/clamp).

### 2.3 Output B (binding 49)

Same nine `t_k` values, second weight set, same sequential accumulation:

| # | off | wB_k = (r, g, b, a) | hex (fp16-exact) |
|---|---|---|---|
| 1 | (-1,-1) | (0.047882080078, -0.022064208984, -0.26904296875, -0.066223144531) | (0x1.884p-5, -0x1.698p-6, -0x1.138p-2, -0x1.0f4p-4) |
| 2 | (-1, 0) | (-0.013168334961, 0.11944580078, -0.220703125, 0.0083160400391) | (-0x1.af8p-7, 0x1.e94p-4, -0x1.c4p-3, 0x1.108p-7) |
| 3 | (-1, 1) | (-0.0947265625, 0.17797851562, -0.10607910156, 0.0048522949219) | (-0x1.84p-4, 0x1.6c8p-3, -0x1.b28p-4, 0x1.3ep-8) |
| 4 | ( 0,-1) | (0.15002441406, -0.097717285156, -0.0018367767334, -0.12976074219) | (0x1.334p-3, -0x1.904p-4, -0x1.e18p-10, -0x1.09cp-3) |
| 5 | ( 0, 0) | (0.020935058594, 0.023071289062, 0.33105468750, -0.0361328125) | (0x1.57p-6, 0x1.7ap-6, 0x1.53p-2, -0x1.28p-5) |
| 6 | ( 0, 1) | (-0.085021972656, 0.1318359375, 0.4169921875, 0.029052734375) | (-0x1.5c4p-4, 0x1.0ep-3, 0x1.abp-2, 0x1.dcp-6) |
| 7 | ( 1,-1) | (0.11926269531, -0.10968017578, -0.11987304688, -0.097412109375) | (0x1.e88p-4, -0x1.c14p-4, -0x1.ebp-4, -0x1.8fp-4) |
| 8 | ( 1, 0) | (0.018600463867, -0.077941894531, 0.051208496094, -0.0042533874512) | (0x1.30cp-6, -0x1.3f4p-4, 0x1.a38p-5, -0x1.16cp-8) |
| 9 | ( 1, 1) | (-0.029266357422, 0.016357421875, 0.28491210938, 0.045989990234) | (-0x1.df8p-6, 0x1.0cp-6, 0x1.23cp-2, 0x1.78cp-5) |

```
outB = (accB - B1B) * GB + B2B
B1B = (0.069824218750, 0.083435058594, 0.19372558594, -0.12707519531)
    = (0x1.1ep-4, 0x1.55cp-4, 0x1.8ccp-3, -0x1.044p-3)
GB  = (3.697265625, 3.19921875, 1.1376953125, 8.796875)
    = (0x1.d94p+1, 0x1.998p+1, 0x1.234p+0, 0x1.198p+3)
B2B = (0.28417968750, 0.18713378906, 0.16345214844, -0.42236328125)
    = (0x1.23p-2, 0x1.7f4p-3, 0x1.4ecp-3, -0x1.b08p-2)
```

`imageStore(dstB, gid, vec4(outB))` at the same `gid`.

## 3. Control flow

Straight-line except the early-out; the 9 taps are sampled once each (fully
unrolled) and shared by both accumulations.

## 4. Boundary behavior

- The single early return tests `gid` against `imageSize(dstA)` (binding 48)
  only; the write to `dstB` (binding 49) has NO guard of its own. The host is
  expected to make dstB at least as large as dstA (they are written at
  identical coordinates).
- No shader-side clamping of sample coordinates; border taps rely on the
  bound sampler's addressing mode. `uv` stays in (0,1) for in-range `gid`
  only if `dstA` is at most half the source size per dimension.
