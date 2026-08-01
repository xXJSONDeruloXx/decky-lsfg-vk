# Spec: shaders 19 + 24 — flow upsample/refine with mask attenuation, 2-texture variant (family)

Family: shader_19 and shader_24 have **structurally identical** SPIR-V (verified by
diffing the disassembly with SSA ids alpha-renamed: the function bodies match
line-for-line; only the constant values and the id bound differ). One
implementation with two constant sets. The constants that differ are **all 146
weight values**: 18 tap matrices (2 textures × 9 taps × mat, 8 values each) plus
the 2-component bias. Everything else — bindings, tap order, math, control flow —
is identical. Full per-shader weight tables are in section 5. All constants were
**machine-extracted** from the disassembly by a parser script and cross-checked:
per shader, 18 (texture, tap) → matrix pairings and 144 + 2 weight slots were
verified mechanically, and every fp16 constant was confirmed exactly
binary16-round-trippable.

This family is the narrower cousin of the 43 + 48 family
(`43-48-flow-refine.md`): same math and same control flow, but the convolution
reads **2** input textures instead of 4 (16-in there, 8-in here), and the flow /
mask samplers sit at bindings 34 / 35 instead of 36 / 37.

## 1. Interface

Compute shader, workgroup size **16 × 16 × 1**. One invocation per output texel.

All descriptors in **set 0** (these are the shader's declarations; the host may
legally bind more slots in the layout):

| binding | kind | format / type | access | role |
|---|---|---|---|---|
| 0  | UBO | struct { float @0; float @4; float @8 } | read | parameters; only offset 4 (`t`) is read |
| 32 | combined image sampler, 2D | | sampled | conv input T0 — **also the size reference** |
| 33 | combined image sampler, 2D | | sampled | conv input T1 |
| 34 | combined image sampler, 2D | | sampled | coarse bidirectional flow (xy = "0→1", zw = "1→0") |
| 35 | combined image sampler, 2D | | sampled | mask (only channel .x used; treated as "occlusion/invalidity", weight = 1 − m) |
| 48 | storage image 2D | **rgba16f** | write-only | output flow pair — bounds reference |

No push constants, no spec constants. fp16 (`Float16`) arithmetic throughout the
convolution; coordinate arithmetic in fp32 as noted.

## 2. Behavior

```
p  = ivec2(gl_GlobalInvocationID.xy);
if (any(greaterThanEqual(p, imageSize(out48)))) return;

S  = vec2(textureSize(T0, 0));      // binding 32 only
pc = vec2(p) + 0.5;
uv = pc / S;
```

### 2.1 Learned 2-channel correction `d` (3×3, 8-in → 2-out convolution)

For each input texture `T_j` (j = 0..1, bindings 32..33) and each tap offset
`o` in the fixed order

```
(-1,-1), (-1,0), (-1,+1), (0,-1), (0,0), (0,+1), (+1,-1), (+1,0), (+1,+1)   // (dx,dy)
```

sample `x = f16vec4( textureLodOffset(T_j, uv, 0, o) )` (the center tap uses plain
`textureLod`; offsets are integer texel offsets at coordinate `uv`), and accumulate

```
d = ( Σ_{j=0..1} Σ_{o} W_{j,o} · x_{j,o} ) + b        // all fp16
```

where each `W_{j,o}` is a 2×4 fp16 matrix (`d.x += dot(W[0][0..3], x)`,
`d.y += dot(W[1][0..3], x)`) and `b` is a 2-vector bias. Accumulation order is
j-major, tap order as listed, each term added left-to-right, bias added last.
Weights/bias per shader: section 5.

### 2.2 Flow update

```
u  = f16vec4( textureLod(flowCoarse, uv, 0) ) * half(2.0);   // binding 34
a  = u.xy + d;          // updated forward flow  (fp16)
bb = u.zw - d;          // updated backward flow (fp16; the same d, negated)
```

### 2.3 Mask attenuation (binding 35, channel .x)

`t` = UBO member at offset 4 (fp32).

```
// forward: probe the mask at the position the forward flow points to,
// scaled by 2*t then quartered (net pixel offset = a * t / 2):
pa  = ( pc + vec2(a) * (2.0*t) * 0.25 ) / S;     // fp32; two successive scalar mults
wa  = half(1.0h) - half( textureLod(mask, pa, 0).x );
a'  = a * wa;

// backward: net pixel offset = bb * (1-t) / 2:
pb  = ( pc + vec2(bb) * (2.0*(1.0 - t)) * 0.25 ) / S;
wb  = half(1.0h) - half( textureLod(mask, pb, 0).x );
b'  = bb * wb;

// center attenuation:
wc  = half(1.0h) - half( textureLod(mask, uv, 0).x );

out48[p] = vec4( f16vec4(a'.x, a'.y, b'.x, b'.y) * wc );     // rgba16f store
```

Note the exact fp32 sequencing for the probe offsets: `vec2(a)` (fp16→fp32), then
`* (2.0*t)` (fp32 scalar), then `* 0.25`, then added to `pc`, then divided by `S`.

Interpretation hint (not normative): this doubles a half-resolution bidirectional
flow (×2), adds a learned residual `d` from a 3×3 conv over 8 channels of
cost/feature inputs (forward gets `+d`, backward `−d`), then downweights each flow
by an occlusion-style mask sampled at the halfway-scaled target position and at the
center. The final `* 0.25` combined with `2t` means the probe uses the flow at
quarter magnitude times the phase.

## 3. Control flow

No loops (fully unrolled 18-tap accumulation). Single conditional: bounds check
against `imageSize(out48)` → early return.

## 4. Boundary behavior

- Out-of-range writes are prevented only by the bounds check vs binding 48.
- No coordinate clamps; taps use constant texel offsets around `uv`, probes `pa`,
  `pb` may leave [0,1] — external sampler address mode decides.
- All sampling explicit LOD 0. Output is rgba16f: no clamping at store beyond
  fp16 conversion.

## 5. Family parameter tables (all values IEEE binary16-exact; decimals uniquely identify the bit pattern)

Row layout: `W[0][k]` are the coefficients producing `d.x` from input channels
k = 0..3; `W[1][k]` produce `d.y`. Values machine-extracted from the constant
declarations and mechanically cross-checked against the tap accumulation order.

#### shader_19

Weights for T0 (binding 32); each row: tap -> W[0][0..3] then W[1][0..3]:
| tap (dx,dy) | W[0][0] | W[0][1] | W[0][2] | W[0][3] | W[1][0] | W[1][1] | W[1][2] | W[1][3] |
|---|---|---|---|---|---|---|---|---|
| (-1,-1) | 0.1260986328125 | 0.330810546875 | -0.036956787109375 | -0.117919921875 | -0.0162200927734375 | 0.017547607421875 | 0.12359619140625 | -0.006114959716796875 |
| (-1, 0) | 0.24658203125 | 0.419677734375 | -0.01541900634765625 | -0.1986083984375 | 0.0119476318359375 | 0.0227813720703125 | 0.247314453125 | -0.04083251953125 |
| (-1,+1) | 0.1357421875 | 0.222900390625 | 0.029571533203125 | -0.09674072265625 | 0.039886474609375 | 0.04815673828125 | 0.12841796875 | -0.05419921875 |
| ( 0,-1) | 0.2388916015625 | 0.4619140625 | -0.0283660888671875 | -0.265869140625 | 0.00408172607421875 | 0.031341552734375 | 0.196044921875 | -0.031402587890625 |
| ( 0, 0) | 0.376708984375 | 0.58056640625 | -0.032684326171875 | -0.34619140625 | 0.01690673828125 | 0.02752685546875 | 0.35986328125 | -0.04156494140625 |
| ( 0,+1) | 0.262451171875 | 0.3984375 | -0.02764892578125 | -0.260986328125 | 0.046630859375 | 0.01959228515625 | 0.219482421875 | -0.04473876953125 |
| (+1,-1) | 0.1068115234375 | 0.30224609375 | -0.0179901123046875 | -0.162353515625 | 0.024658203125 | 0.0709228515625 | 0.1243896484375 | -0.0546875 |
| (+1, 0) | 0.2362060546875 | 0.479736328125 | -0.029083251953125 | -0.253662109375 | 0.0005550384521484375 | 0.03070068359375 | 0.24365234375 | -0.031951904296875 |
| (+1,+1) | 0.1170654296875 | 0.313720703125 | -0.0261993408203125 | -0.1697998046875 | 0.00603485107421875 | -0.0207366943359375 | 0.12127685546875 | 0.0026569366455078125 |

Weights for T1 (binding 33); each row: tap -> W[0][0..3] then W[1][0..3]:
| tap (dx,dy) | W[0][0] | W[0][1] | W[0][2] | W[0][3] | W[1][0] | W[1][1] | W[1][2] | W[1][3] |
|---|---|---|---|---|---|---|---|---|
| (-1,-1) | 0.0186767578125 | 0.07025146484375 | -0.2332763671875 | 0.04833984375 | 0.24609375 | -0.12005615234375 | 0.03277587890625 | -0.286376953125 |
| (-1, 0) | -0.072509765625 | 0.014801025390625 | -0.44775390625 | 0.037384033203125 | 0.259033203125 | -0.2471923828125 | -0.077392578125 | -0.4326171875 |
| (-1,+1) | -0.00324249267578125 | -0.02630615234375 | -0.227783203125 | 0.0521240234375 | 0.1575927734375 | -0.14013671875 | -0.005107879638671875 | -0.3173828125 |
| ( 0,-1) | -0.0030841827392578125 | 0.0301666259765625 | -0.4052734375 | 0.059478759765625 | 0.388427734375 | -0.22998046875 | -0.05816650390625 | -0.468017578125 |
| ( 0, 0) | -0.04327392578125 | 0.04168701171875 | -0.486328125 | 0.07574462890625 | 0.393310546875 | -0.3916015625 | -0.0718994140625 | -0.513671875 |
| ( 0,+1) | -0.01335906982421875 | 0.033905029296875 | -0.450439453125 | 0.0604248046875 | 0.31787109375 | -0.2354736328125 | 0.0000979900360107421875 | -0.47314453125 |
| (+1,-1) | 0.052947998046875 | -0.0005550384521484375 | -0.244384765625 | 0.0305633544921875 | 0.327392578125 | -0.140869140625 | -0.034423828125 | -0.32421875 |
| (+1, 0) | -0.044219970703125 | 0.042694091796875 | -0.41162109375 | 0.025421142578125 | 0.3115234375 | -0.2763671875 | -0.0806884765625 | -0.423095703125 |
| (+1,+1) | -0.004894256591796875 | 0.0697021484375 | -0.276611328125 | 0.0504150390625 | 0.148681640625 | -0.1376953125 | 0.0212249755859375 | -0.314697265625 |

bias b = (-0.00100994110107421875, 0.029144287109375)

Note: shader_19 bias in hex-float form: (-0x1.08cp-10, 0x1.dd8p-6) — fp16 bit
patterns 0x9423, 0x2776.

#### shader_24

Weights for T0 (binding 32); each row: tap -> W[0][0..3] then W[1][0..3]:
| tap (dx,dy) | W[0][0] | W[0][1] | W[0][2] | W[0][3] | W[1][0] | W[1][1] | W[1][2] | W[1][3] |
|---|---|---|---|---|---|---|---|---|
| (-1,-1) | -0.119873046875 | 0.1549072265625 | 0.000753879547119140625 | 0.0966796875 | -0.00024890899658203125 | -0.00070095062255859375 | 0.09918212890625 | 0.00018298625946044921875 |
| (-1, 0) | -0.10736083984375 | 0.0271453857421875 | 0.000216960906982421875 | 0.10302734375 | -0.00022900104522705078125 | 0.000381946563720703125 | 0.06329345703125 | -0.0002219676971435546875 |
| (-1,+1) | -0.131103515625 | 0.214111328125 | -0.000854969024658203125 | 0.12164306640625 | 0.000403881072998046875 | 0.013153076171875 | 0.1629638671875 | -0.0002739429473876953125 |
| ( 0,-1) | -0.10784912109375 | 0.14208984375 | 0.00049304962158203125 | 0.0848388671875 | -0.000317096710205078125 | -0.00836181640625 | 0.09930419921875 | 0.0000209808349609375 |
| ( 0, 0) | -0.08905029296875 | 0.04705810546875 | -0.001049041748046875 | 0.10589599609375 | 0.00116062164306640625 | -0.00940704345703125 | 0.0931396484375 | 0.00015795230865478515625 |
| ( 0,+1) | -0.1334228515625 | 0.212890625 | -0.00020503997802734375 | 0.1119384765625 | -0.0007572174072265625 | -0.0028476715087890625 | 0.14208984375 | 0.000442028045654296875 |
| (+1,-1) | -0.09326171875 | 0.14013671875 | -0.00051116943359375 | 0.11907958984375 | 0.000341892242431640625 | 0.018463134765625 | 0.11627197265625 | -0.000119984149932861328125 |
| (+1, 0) | -0.0810546875 | 0.01678466796875 | -0.000625133514404296875 | 0.1385498046875 | -0.000632762908935546875 | -0.005756378173828125 | 0.07049560546875 | -0.00032806396484375 |
| (+1,+1) | -0.131103515625 | 0.1937255859375 | 0.001918792724609375 | 0.1146240234375 | 0.000319957733154296875 | -0.003467559814453125 | 0.1505126953125 | -0.00002300739288330078125 |

Weights for T1 (binding 33); each row: tap -> W[0][0..3] then W[1][0..3]:
| tap (dx,dy) | W[0][0] | W[0][1] | W[0][2] | W[0][3] | W[1][0] | W[1][1] | W[1][2] | W[1][3] |
|---|---|---|---|---|---|---|---|---|
| (-1,-1) | 0.026947021484375 | -0.00015604496002197265625 | -0.019927978515625 | -0.10992431640625 | -0.08966064453125 | -0.1180419921875 | 0.029449462890625 | 0.00482940673828125 |
| (-1, 0) | -0.0100555419921875 | 0.0000820159912109375 | 0.014373779296875 | -0.225830078125 | -0.165771484375 | -0.116455078125 | 0.034454345703125 | -0.000648021697998046875 |
| (-1,+1) | -0.0185089111328125 | 0.00021898746490478515625 | 0.0036220550537109375 | -0.162353515625 | -0.253173828125 | -0.1480712890625 | 0.1651611328125 | -0.01401519775390625 |
| ( 0,-1) | 0.0031375885009765625 | -0.0003910064697265625 | 0.0007839202880859375 | -0.11834716796875 | -0.3291015625 | -0.07733154296875 | 0.214111328125 | 0.01483154296875 |
| ( 0, 0) | -0.0025177001953125 | 0.000133991241455078125 | -0.000279903411865234375 | -0.249755859375 | -0.334716796875 | -0.068115234375 | 0.10919189453125 | 0.01020050048828125 |
| ( 0,+1) | -0.000569820404052734375 | -0.00006997585296630859375 | 0.00084590911865234375 | -0.1588134765625 | -0.392578125 | -0.072509765625 | 0.315673828125 | 0.0059967041015625 |
| (+1,-1) | -0.01300048828125 | 0.000522136688232421875 | 0.00166416168212890625 | -0.08367919921875 | -0.176025390625 | -0.152099609375 | 0.073486328125 | -0.0242767333984375 |
| (+1, 0) | -0.022613525390625 | -0.00019896030426025390625 | 0.018035888671875 | -0.1861572265625 | -0.13525390625 | -0.11920166015625 | 0.045654296875 | -0.01392364501953125 |
| (+1,+1) | 0.04693603515625 | -0.000119984149932861328125 | -0.0188751220703125 | -0.10638427734375 | -0.14306640625 | -0.1248779296875 | 0.131103515625 | 0.0150604248046875 |

bias b = (-0.000001013278961181640625, -0)

Note: shader_24 bias in hex-float form: (-0x1.1p-20, -0x0p+0) — fp16 bit patterns
0x8011, 0x8000. Both components are exact fp16 values; the second is **negative
zero** (sign bit set) and must be emitted so that the stored constant is -0.0h.
The first is a subnormal.
