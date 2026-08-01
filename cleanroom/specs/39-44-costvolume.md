# Spec: shaders 39 + 44 — local cost-volume construction (3×3 correlation)

Family note: the spirv-dis disassemblies of shader_39 and shader_44 are **byte-identical**.
One implementation serves both; there are no per-shader parameters. (The traced graph
evidently dispatches the same pipeline twice.)

## 1. Interface

Compute shader, workgroup size **16 × 16 × 1**. One invocation per output texel;
`gl_GlobalInvocationID.xy` is the output pixel coordinate.

All descriptors are in **set 0**:

| binding | kind | format / type | access | role |
|---|---|---|---|---|
| 0  | UBO | struct { float @0; float @4; float @8 } | read | parameters (see below) |
| 32 | combined image sampler, 2D | (format unspecified) | sampled | feature set A, texture A0 — **also the size reference** |
| 33 | combined image sampler, 2D | | sampled | feature set A, texture A1 |
| 34 | combined image sampler, 2D | | sampled | feature set A, texture A2 |
| 35 | combined image sampler, 2D | | sampled | feature set A, texture A3 |
| 36 | combined image sampler, 2D | | sampled | feature set B, texture B0 |
| 37 | combined image sampler, 2D | | sampled | feature set B, texture B1 |
| 38 | combined image sampler, 2D | | sampled | feature set B, texture B2 |
| 39 | combined image sampler, 2D | | sampled | feature set B, texture B3 |
| 40 | combined image sampler, 2D | | sampled | flow pair (xy = flow "0→1", zw = flow "1→0") |
| 48 | storage image 2D | **rgba8** (unorm) | write-only | output 0 (costs, offsets group 1) — bounds reference |
| 49 | storage image 2D | **rgba8** (unorm) | write-only | output 1 (costs, offsets group 2) |
| 50 | storage image 2D | **rgba8** (unorm) | write-only | output 2 (cost, offset (+1,+1) in .x) |

UBO members: only the member at **offset 4** is read; call it `t` (a blend/phase factor
in [0,1] by usage). Members at offsets 0 and 8 are declared but never read.

No push constants. No spec constants. Requires fp16 arithmetic (`Float16` capability):
all dot products / normalization below are computed in IEEE binary16 ("half").

## 2. Behavior

Notation: `p = ivec2(gl_GlobalInvocationID.xy)`. Texture sampling below is
`textureLod(..., 0.0)` on normalized UVs; the sampler objects (filtering / address
mode) are external to the shader. `half(x)` = convert fp32→fp16; sums and dots in
half unless stated.

```
if (any(greaterThanEqual(p, imageSize(out48)))) return;      // only guard

S   = vec2(textureSize(A0, 0));        // binding 32 ONLY — all UVs use this size
pc  = vec2(p) + 0.5;                   // texel-center convention
uv  = pc / S;

fl  = f16vec4( textureLod(flow, uv, 0) );        // binding 40
th  = half(t);
d01 = fl.xy * th;                      // fp16 multiply
d10 = fl.zw * half(1.0 - t);           // (1 - t) computed in fp32, then converted

uvA = (pc + vec2(d01)) / S;            // offsets converted fp16→fp32, added in fp32
uvB = (pc + vec2(d10)) / S;

a_i = f16vec4( textureLod(A_i, uvA, 0) )   for i = 0..3     // bindings 32..35
```

For a texel offset `o` (applied with `textureLodOffset`, i.e. an integer offset in
texel units of the sampled texture, at the coordinate `uvB`):

```
c(o) = dot(a_0, f16vec4(textureLodOffset(B0, uvB, 0, o)))
     + dot(a_1, f16vec4(textureLodOffset(B1, uvB, 0, o)))
     + dot(a_2, f16vec4(textureLodOffset(B2, uvB, 0, o)))
     + dot(a_3, f16vec4(textureLodOffset(B3, uvB, 0, o)))
```

Accumulation is left-to-right in ascending texture index (fp16 adds:
`((d0+d1)+d2)+d3`). `o = (0,0)` uses plain `textureLod` (no offset).
This is a 16-channel correlation between set A (sampled at the flow-01-displaced
position) and set B (sampled at the flow-10-displaced position), for the 9 offsets
of a 3×3 neighborhood.

The 9 costs are affinely normalized per channel and packed:

```
v0 = ( c(-1,-1), c(0,-1), c(1,-1), c(-1,0) )        // note offset order (dx,dy)
v1 = ( c(0,0),   c(1,0),  c(-1,1), c(0,1)  )
out48[p] = vec4( (v0 - M0) * S0 + B0n )              // all in fp16, then fp32 for store
out49[p] = vec4( (v1 - M1) * S1 + B1n )
out50[p] = vec4( (c(1,1) - m2) * s2 + b2, 0, 0, 0 )
```

Constants (IEEE binary16, exact; hex form is the SPIR-V float literal):

| const | x | y | z | w |
|---|---|---|---|---|
| M0 (means, group 1)  | 4.71875 (0x1.2ep+2) | 4.84375 (0x1.36p+2) | 4.70703125 (0x1.2d4p+2) | 4.9453125 (0x1.3c8p+2) |
| S0 (scales, group 1) | 0.31884765625 (0x1.468p-2) | 0.345458984375 (0x1.61cp-2) | 0.351806640625 (0x1.684p-2) | 0.349853515625 (0x1.664p-2) |
| B0n (biases, group 1)| 0.1812744140625 (0x1.734p-3) | 0.29150390625 (0x1.2a8p-2) | 0.253173828125 (0x1.034p-2) | 0.322509765625 (0x1.4a4p-2) |
| M1 (means, group 2)  | 5.38671875 (0x1.58cp+2) | 4.9609375 (0x1.3d8p+2) | 4.6953125 (0x1.2c8p+2) | 4.83203125 (0x1.354p+2) |
| S1 (scales, group 2) | 0.2998046875 (0x1.33p-2) | 0.333251953125 (0x1.554p-2) | 0.334228515625 (0x1.564p-2) | 0.352783203125 (0x1.694p-2) |
| B1n (biases, group 2)| 0.355712890625 (0x1.6c4p-2) | 0.298095703125 (0x1.314p-2) | 0.18994140625 (0x1.85p-3) | 0.32080078125 (0x1.488p-2) |

Scalar output (out50.x): `m2 = 4.72265625 (0x1.2e4p+2)`, `s2 = 0.327392578125
(0x1.4f4p-2)`, `b2 = 0.226318359375 (0x1.cf8p-3)`. out50.yzw are written as 0.

There is **no explicit clamp** before the stores; the `rgba8` (unorm) image format
clamps to [0,1] and quantizes to 8 bits at store time (this is a format behavior the
reimplementation inherits by declaring the same storage format).

Interpretation hint (not normative): this builds a 3×3 local cost volume between two
16-channel feature pyramids, each pre-warped toward the interpolation instant by its
respective flow field scaled by `t` / `1−t`; the affine constants quantize the raw
correlations into the unorm range for storage.

## 3. Control flow

No loops. Single conditional: the bounds check `any(p >= imageSize(out48))` →
early return. Everything else is straight-line.

## 4. Boundary behavior

- The write guard tests **only binding 48's** image size; writes to bindings 49 and
  50 use the same `p` unguarded — the dispatch/output sizes must make all three at
  least as large as binding 48.
- No coordinate clamping in the math. `uvA`/`uvB` may leave [0,1] for large flow
  values; behavior then comes from the external sampler's address mode. The
  `textureLodOffset` offsets are compile-time constant `(dx,dy) ∈ {-1,0,1}²`.
- All sampling is explicit LOD 0.
