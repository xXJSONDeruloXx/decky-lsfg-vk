# Shader 25 — warped 3x3 feature-correlation head

Single-shader spec (no family). The disassembly is `asm/shader_25.spvasm`.

Pipeline-context caveat: the provided role notes called bindings 32-37 "flow
pyramid levels 0-5" and the UBO member "flowScale". The disassembly does not
support that reading; the roles below are named from the actual dataflow (ASM
authoritative). What the shader actually computes is a 3x3 correlation cost
volume between warped and local 8-channel feature vectors at four warp
hypotheses, mixed by a small linear head.

## 1. Interface

- Entry point: GLCompute `main`, workgroup size **16 x 16 x 1**.
- Capabilities: `Shader`, `Float16`, `ImageQuery`. All arithmetic after the
  fp32 texture reads is fp16; use `float16_t`/`f16vec2`/`f16vec4` to match.
- Descriptors (all descriptor set 0):

| binding | kind | type / format | access | role name |
|---|---|---|---|---|
| 0 | UBO (`Block`) | struct of 3 floats | read | parameters (see below) |
| 32 | combined image sampler | 2D, float | sampled (LOD 0) **and** texelFetch (LOD 0) | `featA0` — source-A features, channels 0-3 |
| 33 | combined image sampler | 2D, float | sampled + texelFetch | `featA1` — source-A features, channels 4-7 |
| 34 | combined image sampler | 2D, float | sampled + texelFetch | `featB0` — source-B features, channels 0-3 |
| 35 | combined image sampler | 2D, float | sampled + texelFetch | `featB1` — source-B features, channels 4-7 |
| 36 | combined image sampler | 2D, float | sampled only (LOD 0) | `flowP` — flow pair 1 (.xy and .zw are two 2D flows, pixel units) |
| 37 | combined image sampler | 2D, float | sampled only (LOD 0) | `flowQ` — flow pair 2 |
| 48 | storage image | 2D, `rgba8` (unorm) | write-only (`NonReadable`) | `outTex` |

- UBO member layout (std140-compatible scalar floats):

| member | offset | type | role |
|---|---|---|---|
| 0 | 0 | float | unused |
| 1 | 4 | float | `t` — blend factor; the shader uses `1 - t` and `t` as the two flow scales |
| 2 | 8 | float | unused |

- No push constants, no spec constants.
- Every `textureLod` in this shader is explicit LOD 0 with normalized coords;
  every `texelFetch` is LOD 0 with integer coords.

## 2. Grid and shared quantities

```
gid     = ivec2(gl_GlobalInvocationID.xy)      // one output texel per invocation
outSize = imageSize(outTex)
if (gid.x >= outSize.x || gid.y >= outSize.y) return;   // only write guard

S    = textureSize(featA0, 0)      // NOTE: taken from binding 32, LOD 0
dims = vec2(S)                     // fp32
pc   = vec2(gid) + 0.5             // pixel center, unnormalized, fp32
uv   = pc / dims                   // base normalized coordinate
cmax = S - ivec2(1)                // fetch clamp bound

t   = ubo.member1                  // fp32 load
wA  = float16_t(1.0 - t)           // 1-t computed in fp32, then converted
wB  = float16_t(t)
```

All integer fetches from bindings 32-35 use coordinates clamped against
`cmax` derived from binding 32's size; the four feature textures are assumed
same-sized (not checked by the shader).

## 3. Warp-chase coordinates (two per flow texture)

For `F` in { `flowP` (b36), `flowQ` (b37) }:

```
f    = f16vec4(textureLod(F, uv, 0))

d1   = f.xy * wA                       // fp16 multiply
uv1  = (pc + vec2(d1)) / dims          // fp32; offsets are in PIXELS
r1   = f16vec2(textureLod(F, uv1, 0).xy)
uvX  = (pc + vec2(r1)) / dims          // second-step offset used UNSCALED

d2   = f.zw * wB
uv2  = (pc + vec2(d2)) / dims
r2   = f16vec2(textureLod(F, uv2, 0).zw)
uvY  = (pc + vec2(r2)) / dims
```

This yields four hypothesis coordinates:

| name | flow tex | channels | scale on first step |
|---|---|---|---|
| `uvA` | b36 | .xy | `1-t` |
| `uvB` | b36 | .zw | `t` |
| `uvC` | b37 | .xy | `1-t` |
| `uvD` | b37 | .zw | `t` |

Notes: flow values are displacements in pixels (added to `pc` before dividing
by `dims`). Each sampled flow value is round-tripped through fp16 before the
fp32 add. The second lookup's value is applied without any scale. Sampling may
address outside [0,1]; wrap/clamp behavior is sampler state, external to the
shader.

## 4. Warped feature vectors (8 channels as two f16vec4)

```
gA = f16vec4(textureLod(featA0, uvA, 0));  hA = f16vec4(textureLod(featA1, uvA, 0))
gC = f16vec4(textureLod(featA0, uvC, 0));  hC = f16vec4(textureLod(featA1, uvC, 0))
gB = f16vec4(textureLod(featB0, uvB, 0));  hB = f16vec4(textureLod(featB1, uvB, 0))
gD = f16vec4(textureLod(featB0, uvD, 0));  hD = f16vec4(textureLod(featB1, uvD, 0))
```

Hypotheses A and C warp the **A** features; B and D warp the **B** features.

## 5. Local (neighborhood) feature vectors

For each 3x3 offset `o`, the fetch coordinate is `q(o) = clamp(gid + o,
ivec2(0), cmax)` (replicate-at-border). The **center is special**: it is not
fetched but sampled bilinearly at `uv`:

```
o != (0,0):  FB0(o) = f16vec4(texelFetch(featB0, q(o), 0));  FB1(o) = ... featB1 ...
             FA0(o) = f16vec4(texelFetch(featA0, q(o), 0));  FA1(o) = ... featA1 ...
o == (0,0):  FB0c = f16vec4(textureLod(featB0, uv, 0));      FB1c = ... featB1 ...
             FA0c = f16vec4(textureLod(featA0, uv, 0));      FA1c = ... featA1 ...
```

## 6. Correlations

8-channel dot products, all in fp16 (each is `dot(4) + dot(4)`, the two
4-component dots added):

```
corrA(o) = dot(gA, FB0(o)) + dot(hA, FB1(o))     // A vs B-neighborhood
corrC(o) = dot(gC, FB0(o)) + dot(hC, FB1(o))
corrB(o) = dot(gB, FA0(o)) + dot(hB, FA1(o))     // B vs A-neighborhood
corrD(o) = dot(gD, FA0(o)) + dot(hD, FA1(o))
```

For each hypothesis X in {A,B,C,D} the nine correlations are packed as:

```
u_X = f16vec4( corrX(-1,-1), corrX(0,-1), corrX(+1,-1), corrX(-1,0) )
v_X = f16vec4( corrX(0,0),   corrX(+1,0), corrX(-1,+1), corrX(0,+1) )   // (0,0) = bilinear center
s_X = corrX(+1,+1)                                                       // scalar
```

## 7. Normalization and linear head (all fp16)

Three shared affine+clamp normalizers (constants in section 9):

```
n1(x) = clamp((x - A1) * B1 + C1, 0, 1)      // componentwise, applied to every u_X
n2(x) = clamp((x - A2) * B2 + C2, 0, 1)      // applied to every v_X
ns(s) = clamp((s - as) * bs + cs, 0, 1)      // scalar, applied to every s_X
```

Head (matrix * vector as `out_i = sum_c M[i][c] * x[c]`; `V * s` is
vector-times-scalar). Terms are accumulated in exactly this order:

```
acc =  M1 * n1(u_A)  +  M2 * n2(v_A)  +  V_A * ns(s_A)
    +  M3 * n1(u_B)  +  M4 * n2(v_B)  +  V_B * ns(s_B)
    +  M5 * n1(u_C)  +  M6 * n2(v_C)  +  V_C * ns(s_C)
    +  M7 * n1(u_D)  +  M8 * n2(v_D)  +  V_D * ns(s_D)
```

Final affine and store:

```
res = (acc - FA) * FB + FC          // componentwise fp16
imageStore(outTex, gid, vec4(res))  // fp16 -> fp32, rgba8 unorm store
```

The `rgba8` store clamps to [0,1] and quantizes to 8 bits (observable).

*Interpretation (hint, not normative): a 3x3 local cost volume between warped
and reference 8-dim features at four flow hypotheses (two flow textures, each
carrying a "forward"-scaled and "backward"-scaled field via `1-t` / `t`),
normalized and reduced 36 -> 4 by a linear layer — i.e. a learned flow
candidate scorer/aggregator, with the output quantized to rgba8.*

## 8. Control flow / boundary summary

- Single early-out on `gid >= outSize`; otherwise straight-line code (fully
  unrolled; no loops, no other branches).
- Integer fetches are clamped to [0, S-1] by the shader (replicate border).
- Bilinear samples (flow chase and warped features) may go outside [0,1];
  handling is the external sampler's job.
- The shader never checks the sizes of bindings 33-37 or the UBO contents.

## 9. Constant tables

Hex fp16 literals are authoritative; decimals for reading. Matrices row-major:
row = output channel (r,g,b,a of the store), column = input component index of
the normalized correlation 4-vector it multiplies.


**M1 (u_A)**

| out ch | in[0] | in[1] | in[2] | in[3] |
|---|---|---|---|---|
| r | `0x1.cdp-2` (+0.45019531) | `-0x1.0fcp-4` (-0.066345215) | `0x1.5d8p-2` (+0.34130859) | `-0x1.828p-4` (-0.094360352) |
| g | `0x1.f98p-2` (+0.49365234) | `0x1.3dcp-1` (+0.62060547) | `0x1.ca4p-2` (+0.44750977) | `0x1.29p-1` (+0.58007812) |
| b | `0x1.6ep-3` (+0.17871094) | `-0x1.90cp-4` (-0.097839355) | `0x1.2c4p-2` (+0.29321289) | `-0x1.4a4p-3` (-0.16125488) |
| a | `0x1.f1p-2` (+0.48535156) | `0x1.f9cp-2` (+0.49389648) | `0x1.a8cp-2` (+0.41479492) | `0x1.4acp-2` (+0.32299805) |

**M2 (v_A)**

| out ch | in[0] | in[1] | in[2] | in[3] |
|---|---|---|---|---|
| r | `-0x1.6d4p-2` (-0.35668945) | `-0x1.c8cp-4` (-0.11151123) | `0x1.04cp-2` (+0.25463867) | `0x1.c94p-11` (+0.00087213516) |
| g | `0x1.028p-1` (+0.50488281) | `0x1.808p-1` (+0.75097656) | `0x1.c38p-4` (+0.11022949) | `0x1.4f8p-1` (+0.65527344) |
| b | `-0x1.5a8p-4` (-0.084594727) | `-0x1.3a8p-4` (-0.076782227) | `0x1.2bp-5` (+0.036499023) | `-0x1.7bcp-4` (-0.092712402) |
| a | `0x1.b38p-2` (+0.42529297) | `0x1.d8p-3` (+0.23046875) | `0x1.6ccp-2` (+0.35620117) | `0x1.66cp-2` (+0.3503418) |

**M3 (u_B)**

| out ch | in[0] | in[1] | in[2] | in[3] |
|---|---|---|---|---|
| r | `-0x1.108p-1` (-0.53222656) | `-0x1.878p-2` (-0.38232422) | `-0x1.62cp-1` (-0.69287109) | `-0x1.07cp-1` (-0.51513672) |
| g | `-0x1.bcp-4` (-0.10839844) | `0x1.294p-4` (+0.072570801) | `-0x1.59cp-4` (-0.084411621) | `0x1.a54p-4` (+0.10284424) |
| b | `-0x1.4b4p-1` (-0.64697266) | `-0x1.1cp-1` (-0.5546875) | `-0x1.19p-1` (-0.54882812) | `-0x1.e8cp-2` (-0.47729492) |
| a | `-0x1.18p-2` (-0.2734375) | `-0x1.38cp-4` (-0.07635498) | `-0x1.54cp-2` (-0.33276367) | `-0x1.6e4p-4` (-0.089416504) |

**M4 (v_B)**

| out ch | in[0] | in[1] | in[2] | in[3] |
|---|---|---|---|---|
| r | `-0x1.0c4p+0` (-1.0478516) | `-0x1.0c8p-1` (-0.52441406) | `0x1.5a8p-6` (+0.021148682) | `-0x1.e88p-3` (-0.23852539) |
| g | `-0x1.f24p-5` (-0.060821533) | `0x1.81cp-3` (+0.18835449) | `-0x1.0e4p-3` (-0.13195801) | `0x1.928p-3` (+0.1965332) |
| b | `-0x1.a2p-2` (-0.40820312) | `-0x1.e3cp-2` (-0.47241211) | `-0x1.30cp-1` (-0.59521484) | `-0x1.02cp-1` (-0.50537109) |
| a | `0x1.2b4p-3` (+0.14611816) | `-0x1.868p-3` (-0.19067383) | `-0x1.554p-2` (-0.33325195) | `-0x1.3c8p-3` (-0.15454102) |

**M5 (u_C)**

| out ch | in[0] | in[1] | in[2] | in[3] |
|---|---|---|---|---|
| r | `0x1.b08p-4` (+0.10559082) | `0x1.10cp-2` (+0.26635742) | `-0x1.974p-5` (-0.049713135) | `0x1.378p-2` (+0.30419922) |
| g | `-0x1.738p-5` (-0.045349121) | `-0x1.a88p-3` (-0.20727539) | `-0x1.76p-5` (-0.045654297) | `-0x1.73p-3` (-0.18115234) |
| b | `0x1.ac4p-4` (+0.10455322) | `0x1.4ecp-2` (+0.3269043) | `0x1.658p-3` (+0.17456055) | `0x1.24cp-2` (+0.28588867) |
| a | `-0x1.9cp-5` (-0.050292969) | `-0x1.9b8p-3` (-0.20092773) | `0x1.124p-3` (+0.13391113) | `-0x1.02cp-2` (-0.25268555) |

**M6 (v_C)**

| out ch | in[0] | in[1] | in[2] | in[3] |
|---|---|---|---|---|
| r | `-0x1.39cp-1` (-0.61279297) | `0x1.7bcp-3` (+0.1854248) | `0x1.59p-3` (+0.16845703) | `0x1.43p-6` (+0.019714355) |
| g | `-0x1.d6cp-2` (-0.4597168) | `-0x1.e8p-5` (-0.059570312) | `-0x1.cap-3` (-0.22363281) | `0x1.c84p-7` (+0.013923645) |
| b | `0x1.f78p-2` (+0.49169922) | `0x1.21cp-2` (+0.28295898) | `0x1.4dp-3` (+0.16259766) | `0x1.1e8p-2` (+0.27978516) |
| a | `-0x1.bp-1` (-0.84375) | `-0x1.038p-2` (-0.25341797) | `-0x1.ddcp-8` (-0.0072898865) | `-0x1.bcp-3` (-0.21679688) |

**M7 (u_D)**

| out ch | in[0] | in[1] | in[2] | in[3] |
|---|---|---|---|---|
| r | `0x1.89p-4` (+0.095947266) | `0x1.e74p-3` (+0.23791504) | `0x1.118p-4` (+0.066772461) | `0x1.5ep-2` (+0.34179688) |
| g | `-0x1.30cp-9` (-0.002325058) | `-0x1.1a4p-3` (-0.13781738) | `0x1.434p-5` (+0.039459229) | `-0x1.174p-3` (-0.13635254) |
| b | `0x1.768p-3` (+0.18286133) | `0x1.164p-2` (+0.27172852) | `0x1.2d4p-3` (+0.14709473) | `0x1.19p-2` (+0.27441406) |
| a | `0x1.214p-7` (+0.0088272095) | `-0x1.788p-3` (-0.18383789) | `0x1.e64p-6` (+0.029678345) | `-0x1.1d8p-3` (-0.1394043) |

**M8 (v_D)**

| out ch | in[0] | in[1] | in[2] | in[3] |
|---|---|---|---|---|
| r | `-0x1.624p-1` (-0.69189453) | `0x1.9d8p-3` (+0.2019043) | `0x1.7a8p-2` (+0.36962891) | `0x1.60cp-6` (+0.021530151) |
| g | `-0x1.5d4p-2` (-0.34106445) | `-0x1.198p-6` (-0.017181396) | `-0x1.91cp-3` (-0.19616699) | `0x1.becp-6` (+0.027267456) |
| b | `0x1.f74p-2` (+0.49145508) | `0x1.58cp-2` (+0.33666992) | `0x1.80cp-3` (+0.18786621) | `0x1.254p-2` (+0.28637695) |
| a | `-0x1.728p-1` (-0.72363281) | `-0x1.694p-4` (-0.088195801) | `0x1.244p-5` (+0.035675049) | `-0x1.9fcp-4` (-0.10150146) |

**V_A**: `0x1.694p-2` (+0.3527832), `0x1.978p-4` (+0.099487305), `0x1p-7` (+0.0078125), `0x1.5d8p-2` (+0.34130859)

**V_B**: `-0x1.c3p-6` (-0.027526855), `-0x1.658p-3` (-0.17456055), `-0x1.2f4p-1` (-0.59228516), `-0x1.6a8p-2` (-0.35400391)

**V_C**: `0x1.19p-2` (+0.27441406), `-0x1.61cp-3` (-0.17272949), `0x1.16cp-4` (+0.068054199), `0x1.f6p-5` (+0.061279297)

**V_D**: `0x1.548p-2` (+0.33251953), `-0x1.a9cp-7` (-0.012992859), `0x1.56cp-3` (+0.1673584), `0x1.824p-4` (+0.094299316)

**A1 (n1 subtract)**: `0x1.4ep+1` (+2.609375), `0x1.57cp+1` (+2.6855469), `0x1.4dcp+1` (+2.6074219), `0x1.5b8p+1` (+2.7148438)

**B1 (n1 multiply)**: `0x1.65cp+0` (+1.3974609), `0x1.1fcp+0` (+1.1240234), `0x1.568p+0` (+1.3378906), `0x1.1e4p+0` (+1.1181641)

**C1 (n1 add)**: `-0x1.c4cp-2` (-0.44213867), `0x1.53p-4` (+0.082763672), `-0x1.22cp-1` (-0.56787109), `0x1.8dp-4` (+0.096923828)

**A2 (n2 subtract)**: `0x1.72cp+1` (+2.8964844), `0x1.5b8p+1` (+2.7148438), `0x1.4ep+1` (+2.609375), `0x1.584p+1` (+2.6894531)

**B2 (n2 multiply)**: `0x1.fc4p-1` (+0.99267578), `0x1.ab8p-1` (+0.83496094), `0x1.f08p-1` (+0.96972656), `0x1.91p-1` (+0.78320312)

**C2 (n2 add)**: `0x1.5dp-2` (+0.34082031), `0x1.efp-3` (+0.24169922), `-0x1.1d8p-4` (-0.069702148), `0x1.908p-3` (+0.19555664)

**FA (final subtract)**: `-0x1.9a8p-1` (-0.80175781), `0x1.658p-2` (+0.34912109), `0x1.cb4p-3` (+0.22424316), `-0x1.07cp-1` (-0.51513672)

**FB (final multiply)**: `0x1.154p+0` (+1.0830078), `0x1.ea8p+0` (+1.9160156), `0x1.3e8p+0` (+1.2441406), `0x1.76p+0` (+1.4609375)

**FC (final add)**: `-0x1.914p-3` (-0.19592285), `0x1.a08p-1` (+0.81347656), `0x1.6b4p-2` (+0.35473633), `0x1.f88p-1` (+0.98535156)

**Scalar normalizer**: `as` = `0x1.4e4p+1` (+2.611328125), `bs` = `0x1.0c4p+0` (+1.0478516), `cs` = `-0x1.808p-5` (-0.046936035)
