# shader_03 — luminance pyramid build (7 levels)

Source of truth: `asm/shader_03.spvasm`. One compute pass that converts a color
frame to luminance and produces a 7-level mip-style pyramid (each level half
the resolution of the previous) in a single dispatch, using workgroup shared
memory for the in-workgroup reductions.

## 1. Interface

- Workgroup size: **16 x 16 x 1**.
- Built-ins used: `gl_WorkGroupID`, `gl_LocalInvocationID` (NOT
  `gl_GlobalInvocationID`).
- All descriptors are in **set 0**:

| binding | kind | format | access | role |
|---|---|---|---|---|
| 0 | UBO | struct, see below | read | parameters |
| 32 | combined image sampler, 2D float | (sampled, format unknown to shader) | read | source color frame |
| 48 | storage image 2D | `r8` | write-only (`NonReadable`) | pyramid level 0 (finest) |
| 49 | storage image 2D | `r8` | write-only | pyramid level 1 |
| 50 | storage image 2D | `r8` | write-only | pyramid level 2 |
| 51 | storage image 2D | `r8` | write-only | pyramid level 3 |
| 52 | storage image 2D | `r8` | write-only | pyramid level 4 |
| 53 | storage image 2D | `r8` | write-only | pyramid level 5 |
| 54 | storage image 2D | `r8` | write-only | pyramid level 6 (coarsest) |

- UBO layout (std140-compatible; all three members are 32-bit floats):

| offset | type | role |
|---|---|---|
| 0 | float | `srcCoordScale` — multiplies level-0 output pixel coordinates to produce source-frame pixel coordinates (see 2.1). This is the only member the shader reads. |
| 4 | float | declared, **never read** by this shader |
| 8 | float | declared, **never read** by this shader |

- No push constants. No spec constants.
- Shared memory: one `float16_t tile[32][32]` array (indexed `tile[x][y]` below;
  first index is the x/horizontal index). Requires FP16 arithmetic
  (`GL_EXT_shader_explicit_arithmetic_types_float16` in GLSL); all luminance
  math below is performed in IEEE half precision unless stated otherwise.

## 2. Behavior

Notation:

```
wg  = gl_WorkGroupID.xy            (uvec2)
lid = gl_LocalInvocationID.xy      (uvec2, 0..15 each)
srcSize = vec2(textureSize(src, 0))    // source sampler, LOD 0, as floats
s   = ubo.srcCoordScale
luma(v3) = dot(f16vec3(v.rgb), f16vec3(W))   // half-precision dot
W = (0x1.32p-2, 0x1.2c8p-1, 0x1.d2cp-4)
  = (0.298828125, 0.5869140625, 0.11395263671875)      // fp16-exact
```

(Interpretation: W is Rec.601 luma weights rounded to fp16.)

Each workgroup produces one 64x64 tile of level 0, one 32x32 tile of level 1,
16x16 of level 2, 8x8 of level 3, 4x4 of level 4, 2x2 of level 5 and 1 texel
of level 6. Tile origins: level 0 at `wg*64`, level 1 at `wg*32`, level k at
`wg*(64 >> k)`.

### 2.1 Phase 1 — sample source, write levels 0 and 1

Two nested loops, outer `j = 0,1` (y), inner `i = 0,1` (x). Per (i, j):

```
p = wg*32 + lid*2 + uvec2(i, j)     // level-1 texel this iteration produces
q = p * 2                            // level-0 base texel (even coords)
```

Four source samples are taken at the four level-0 texels
`q + d` for `d in D = [(0,0), (1,0), (1,1), (0,1)]` (exactly this order):

```
uv(t) = (vec2(t) + 0.5) * s / srcSize          // t is an integer texel coord
L_d   = luma(textureLod(src, uv(q + d), 0.0).rgb)   // fp16 result
```

Notes on the sample coordinate: the `+0.5` texel-center offset is added
**before** multiplying by `s`; the division is by the *source* texture's
level-0 size. LOD is explicitly 0. If `s * level0Size > srcSize` the UV
exceeds [0,1]; addressing is left to the externally supplied sampler.

Writes:

- **Level 0** (binding 48): for each `d` in D, if
  `all(lessThan(ivec2(q + d), imageSize(level0)))`, store
  `float(L_d)` (splatted to rgba; format `r8` keeps `.r`) at `ivec2(q + d)`.
- **Level 1** (binding 49): compute, in fp16 and in exactly this
  association order,

  ```
  m = 0.25h * (((L_(0,0) + L_(1,0)) + L_(1,1)) + L_(0,1))
  ```

  If `all(lessThan(ivec2(p), imageSize(level1)))`, store `float(m)` at
  `ivec2(p)`.
- Shared: `tile[lid.x*2 + i][lid.y*2 + j] = m` (unconditionally).

So after phase 1 `tile` holds the workgroup's full 32x32 level-1 tile in
local coordinates.

### 2.2 Phase 2 — five in-place reduction rounds, write levels 2..6

Five identical rounds with parameters `(n, dst)`:

| round | n | dst binding | dst level |
|---|---|---|---|
| 1 | 16 | 50 | 2 |
| 2 | 8 | 51 | 3 |
| 3 | 4 | 52 | 4 |
| 4 | 2 | 53 | 5 |
| 5 | 1 | 54 | 6 |

Each round is preceded by `barrier()` (workgroup control barrier with
workgroup-memory acquire/release semantics; SPIR-V semantics value 264 =
AcquireRelease | WorkgroupMemory). Round body, executed only by threads with
`lid.x < n && lid.y < n` (for round 1, n = 16, this predicate is trivially
true for the whole workgroup):

```
x = lid.x; y = lid.y
a = tile[2x    ][2y    ]
b = tile[2x + 1][2y    ]
c = tile[2x    ][2y + 1]
d = tile[2x + 1][2y + 1]
m = 0.25h * (((a + b) + c) + d)          // fp16, this association order
outCoord = ivec2(wg * n + lid)
if (all(lessThan(outCoord, imageSize(dst)))) imageStore(dst, outCoord, vec4(float(m)))
tile[x][y] = m
```

There is no barrier after round 5; the shader then returns. (Within a round,
each active thread reads only elements it or other active threads wrote in
the *previous* round, and writes `tile[x][y]` with `x,y < n`, which no other
thread of the same round reads, so the read-then-write in one round is safe.)

## 3. Control flow summary

- Phase-1 loops: outer y-loop trip count 2, inner x-loop trip count 2 (fully
  deterministic, no data-dependent exits).
- 5 barriers total, one before each reduction round; every thread reaches all
  of them (the round bodies are predicated, the barriers are not — do NOT put
  the barrier inside the `if`).
- No early return.

## 4. Boundary behavior

- Every `imageStore` is individually guarded by
  `all(lessThan(ivec2(coord), imageSize(thatImage)))` — signed compare against
  the destination image's own size. Coordinates are non-negative by
  construction, so only the upper bound matters.
- Nothing clamps the source-sample UV; out-of-range sampling behavior comes
  from the bound sampler.
- The shader therefore tolerates dispatches whose tiles overhang any level's
  extent; the shared-memory tile is always fully computed regardless.

## 5. Precision requirements

Bit-exact reproduction requires fp16 arithmetic for: the luma dot product,
the 4-way averages (association order as written), and the shared-memory
storage type. Values are widened to float32 only immediately before each
`imageStore` (where `r8` storage then quantizes to unorm8).
