# shader_06 — same-res 3x3 conv, 4 input channels -> 4 output channels

Source of truth: `asm/shader_06.spvasm`. One output texel per invocation.
Reads a 4-channel input at the SAME resolution as the output (no coordinate
scaling — contrast with shader_05's x2), applies a 3x3 convolution with full
4x4 channel mixing per tap, then an output affine remap, and stores to an
`rgba8` image.

(Interpretation, after the exact math: a 4-in/4-out 3x3 CNN convolution layer
with an output requantization affine for unorm8 storage. Unlike shader_05
there is no per-tap input affine — the input is consumed as sampled.)

## 1. Interface

- Workgroup size: **16 x 16 x 1**. Uses `gl_GlobalInvocationID`.
- Descriptors, all set 0:

| binding | kind | format | access | role |
|---|---|---|---|---|
| 32 | combined image sampler, 2D float | (sampled) | read | 4-channel input feature map |
| 48 | storage image 2D | `rgba8` | write-only (`NonReadable`) | 4-channel output feature map |

- No UBO, no push constants, no spec constants, no shared memory.
- FP16 arithmetic throughout (`GL_EXT_shader_explicit_arithmetic_types_float16`).

## 2. Behavior

```
gid = ivec2(gl_GlobalInvocationID.xy)
if (any(greaterThanEqual(gid, imageSize(dst)))) return;

srcSize = vec2(textureSize(src, 0))
uv = (vec2(gid) + 0.5) / srcSize            // 1:1 mapping, no *2
```

Nine taps `v(off) = f16vec4(textureLodOffset(src, uv, 0.0, off))` (LOD 0,
constant texel offsets, full rgba). Accumulate in fp16, sequentially in the
tap order below:

```
acc = M1 * v(-1,-1); acc += M2 * v(-1,0); ... ; acc += M9 * v(1,1)
```

Each `Mk` is an `f16mat4` and `M * v` is the standard column-major
matrix-vector product: `result = Σ_j column_j * v[j]` (v.r multiplies
column 1, v.g column 2, v.b column 3, v.a column 4). Columns below are
written as GLSL constructor order `f16mat4(col1, col2, col3, col4)`, each
column being an (out.r, out.g, out.b, out.a) 4-vector. All values fp16-exact.

M1, off (-1,-1):
- col1 (0.28100585938, 0.396484375, 0.20422363281, 0.18115234375) = (0x1.1fcp-2, 0x1.96p-2, 0x1.a24p-3, 0x1.73p-3)
- col2 (0.0022754669189, 0.0083007812500, -0.0066604614258, 0.017120361328) = (0x1.2a4p-9, 0x1.1p-7, -0x1.b48p-8, 0x1.188p-6)
- col3 (-0.28930664062, -0.19592285156, -0.28198242188, -0.0029315948486) = (-0x1.284p-2, -0x1.914p-3, -0x1.20cp-2, -0x1.804p-9)
- col4 (0.017227172852, 0.076110839844, -0.38549804688, 0.042022705078) = (0x1.1a4p-6, 0x1.37cp-4, -0x1.8acp-2, 0x1.584p-5)

M2, off (-1,0):
- col1 (-0.042236328125, 0.57373046875, 0.32958984375, 0.18994140625) = (-0x1.5ap-5, 0x1.25cp-1, 0x1.518p-2, 0x1.85p-3)
- col2 (0.014884948730, 0.051116943359, -0.031829833984, 0.0067481994629) = (0x1.e7cp-7, 0x1.a2cp-5, -0x1.04cp-5, 0x1.ba4p-8)
- col3 (0.0032176971436, -0.3828125, -0.37084960938, 0.028533935547) = (0x1.a5cp-9, -0x1.88p-2, -0x1.7bcp-2, 0x1.d38p-6)
- col4 (-0.0380859375, 0.072448730469, 0.016708374023, 0.061370849609) = (-0x1.38p-5, 0x1.28cp-4, 0x1.11cp-6, 0x1.f6cp-5)

M3, off (-1,1):
- col1 (-0.33666992188, 0.34155273438, 0.17761230469, 0.029235839844) = (-0x1.58cp-2, 0x1.5dcp-2, 0x1.6bcp-3, 0x1.dfp-6)
- col2 (-0.022705078125, -0.055694580078, -0.032562255859, 0.0034389495850) = (-0x1.74p-6, -0x1.c84p-5, -0x1.0acp-5, 0x1.c2cp-9)
- col3 (0.27124023438, -0.20324707031, -0.33984375, 0.0049285888672) = (0x1.15cp-2, -0x1.a04p-3, -0x1.5cp-2, 0x1.43p-8)
- col4 (-0.0074043273926, 0.16552734375, -0.18872070312, 0.037658691406) = (-0x1.e54p-8, 0x1.53p-3, -0x1.828p-3, 0x1.348p-5)

M4, off (0,-1):
- col1 (0.52294921875, 0.071228027344, -0.044586181641, 0.058410644531) = (0x1.0bcp-1, 0x1.23cp-4, -0x1.6d4p-5, 0x1.de8p-5)
- col2 (-0.012573242188, 0.027557373047, 0.1142578125, 0.021209716797) = (-0x1.9cp-7, 0x1.c38p-6, 0x1.d4p-4, 0x1.5b8p-6)
- col3 (-0.42456054688, -0.03857421875, 0.096130371094, -0.019409179688) = (-0x1.b2cp-2, -0x1.3cp-5, 0x1.89cp-4, -0x1.3ep-6)
- col4 (0.015853881836, -0.31396484375, 0.085205078125, 0.088500976562) = (0x1.03cp-6, -0x1.418p-2, 0x1.5dp-4, 0x1.6a8p-4)

M5, off (0,0) (center tap, sampled with no offset):
- col1 (0.067443847656, 0.068237304688, -0.036346435547, 0.20202636719) = (0x1.144p-4, 0x1.178p-4, -0x1.29cp-5, 0x1.9dcp-3)
- col2 (-0.023071289062, 0.028823852539, 0.10894775391, 0.011940002441) = (-0x1.7ap-6, 0x1.d84p-6, 0x1.be4p-4, 0x1.874p-7)
- col3 (0.021423339844, -0.036193847656, 0.16223144531, 0.036865234375) = (0x1.5fp-6, -0x1.288p-5, 0x1.4c4p-3, 0x1.2ep-5)
- col4 (-0.037322998047, -0.26611328125, 0.4873046875, 0.12780761719) = (-0x1.31cp-5, -0x1.108p-2, 0x1.f3p-2, 0x1.05cp-3)

M6, off (0,1):
- col1 (-0.48461914062, -0.0050849914551, -0.0051536560059, 0.18518066406) = (-0x1.f04p-2, -0x1.4d4p-8, -0x1.51cp-8, 0x1.7b4p-3)
- col2 (-0.022323608398, 0.012138366699, 0.12139892578, -0.00022995471954) = (-0x1.6dcp-6, 0x1.8dcp-7, 0x1.f14p-4, -0x1.e24p-13)
- col3 (0.42041015625, -0.031524658203, 0.053558349609, 0.026870727539) = (0x1.ae8p-2, -0x1.024p-5, 0x1.b6cp-5, 0x1.b84p-6)
- col4 (0.050903320312, -0.44946289062, 0.30541992188, 0.095520019531) = (0x1.a1p-5, -0x1.cc4p-2, 0x1.38cp-2, 0x1.874p-4)

M7, off (1,-1):
- col1 (0.31689453125, -0.37719726562, -0.013618469238, -0.22326660156) = (0x1.448p-2, -0x1.824p-2, -0x1.be4p-7, -0x1.c94p-3)
- col2 (-0.028625488281, -0.018066406250, -0.084777832031, 0.040496826172) = (-0x1.d5p-6, -0x1.28p-6, -0x1.5b4p-4, 0x1.4bcp-5)
- col3 (-0.2666015625, 0.16943359375, 0.085571289062, -0.024078369141) = (-0x1.11p-2, 0x1.5bp-3, 0x1.5e8p-4, -0x1.8a8p-6)
- col4 (-0.032562255859, 0.15759277344, -0.34887695312, -0.058319091797) = (-0x1.0acp-5, 0x1.42cp-3, -0x1.654p-2, -0x1.ddcp-5)

M8, off (1,0):
- col1 (0.058258056641, -0.580078125, -0.34692382812, -0.0083084106445) = (0x1.dd4p-5, -0x1.29p-1, -0x1.634p-2, -0x1.104p-7)
- col2 (0.025192260742, 0.011932373047, -0.086120605469, 0.013916015625) = (0x1.9ccp-6, 0x1.87p-7, -0x1.60cp-4, 0x1.c8p-7)
- col3 (0.0084915161133, 0.3330078125, 0.5546875, 0.040649414062) = (0x1.164p-7, 0x1.55p-2, 0x1.1cp-1, 0x1.4dp-5)
- col4 (-0.017013549805, 0.29858398438, 0.32690429688, -0.061126708984) = (-0x1.16cp-6, 0x1.31cp-2, 0x1.4ecp-2, -0x1.f4cp-5)

M9, off (1,1):
- col1 (-0.38623046875, -0.49340820312, -0.28295898438, 0.17102050781) = (-0x1.8b8p-2, -0x1.f94p-2, -0x1.21cp-2, 0x1.5e4p-3)
- col2 (0.035369873047, 0.023452758789, -0.081604003906, -0.016952514648) = (0x1.21cp-5, 0x1.804p-6, -0x1.4e4p-4, -0x1.15cp-6)
- col3 (0.26416015625, 0.32910156250, 0.47753906250, 0.018386840820) = (0x1.0e8p-2, 0x1.51p-2, 0x1.e9p-2, 0x1.2d4p-6)
- col4 (0.13903808594, 0.023025512695, -0.084228515625, -0.021194458008) = (0x1.1ccp-3, 0x1.794p-6, -0x1.59p-4, -0x1.5b4p-6)

Output affine (componentwise fp16; subtract, then multiply, then add):

```
out = (acc - B1) * G + B2

B1 = (0.0021209716797, -0.0070228576660, 0.026550292969, 0.10119628906)
   = (0x1.16p-9, -0x1.cc4p-8, 0x1.b3p-6, 0x1.9e8p-4)
G  = (4.10546875, 8.515625, 5.17578125, 2.251953125)
   = (0x1.06cp+2, 0x1.108p+3, 0x1.4b4p+2, 0x1.204p+1)
B2 = (0.10455322266, 0.27416992188, -0.13793945312, -0.16271972656)
   = (0x1.ac4p-4, 0x1.18cp-2, -0x1.1a8p-3, -0x1.4d4p-3)
```

Store: `imageStore(dst, gid, vec4(out))` — fp16 -> float32, then the `rgba8`
format quantizes/clamps to unorm8.

Offset convention: first component is x, second y.

## 3. Control flow

Straight-line except the early-out; the 9 taps are fully unrolled.

## 4. Boundary behavior

- Writes guarded only by the top early return against `imageSize(dst)`.
- No shader-side clamping of sample coordinates; the +/-1 offsets read outside
  the source at borders, handled by the bound sampler's addressing mode. If
  `dst` and `src` are the same size, `uv` stays in (0,1) for all in-range gid.
