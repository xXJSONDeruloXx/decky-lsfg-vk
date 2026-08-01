# Spec: shader 49 — flow-chased 3×3 correlations + dense mixing layer ("correlation encoder")

Single shader (own spec, not a family). It computes four 3×3 local cost volumes
(each 9 correlations of 16-channel features), normalizes and clamps them, and maps
the resulting 36 values through a constant dense (fully-connected) layer to two
4-channel outputs.

## 1. Interface

Compute shader, workgroup size **16 × 16 × 1**. One invocation per output texel.

All descriptors in **set 0**:

| binding | kind | format / type | access | role |
|---|---|---|---|---|
| 0  | UBO | struct { float @0; float @4; float @8 } | read | only offset 4 (`t`) is read |
| 32 | combined image sampler, 2D | | sampled + texelFetch | feature set A, A0 — **also the size reference** |
| 33 | combined image sampler, 2D | | sampled + texelFetch | feature set A, A1 |
| 34 | combined image sampler, 2D | | sampled + texelFetch | feature set A, A2 |
| 35 | combined image sampler, 2D | | sampled + texelFetch | feature set A, A3 |
| 36 | combined image sampler, 2D | | sampled + texelFetch | feature set B, B0 |
| 37 | combined image sampler, 2D | | sampled + texelFetch | feature set B, B1 |
| 38 | combined image sampler, 2D | | sampled + texelFetch | feature set B, B2 |
| 39 | combined image sampler, 2D | | sampled + texelFetch | feature set B, B3 |
| 40 | combined image sampler, 2D | | sampled | flow pair P (xy = "0→1", zw = "1→0") |
| 41 | combined image sampler, 2D | | sampled | flow pair Q (a second flow pair, same layout) |
| 48 | storage image 2D | **rgba8** (unorm) | write-only | output 0 — bounds reference |
| 49 | storage image 2D | **rgba8** (unorm) | write-only | output 1 |

No push constants / spec constants. `Float16` capability: all dots, sums,
normalizations and the dense layer are IEEE binary16 ("half") arithmetic.

## 2. Behavior

```
p   = ivec2(gl_GlobalInvocationID.xy);
if (any(greaterThanEqual(p, imageSize(out48)))) return;

S    = vec2(textureSize(A0, 0));       // binding 32 only
pc   = vec2(p) + 0.5;
uv   = pc / S;
szm1 = ivec2(textureSize(A0, 0)) - ivec2(1);   // clamp limit for texelFetch
t    = UBO@4;                          // fp32
h0   = half(1.0 - t);                  // 1-t in fp32, then to fp16
h1   = half(t);
```

### 2.1 Flow chasing — four lookup positions

For a flow-pair texture `X` (binding 40 = P, binding 41 = Q):

```
v    = f16vec4( textureLod(X, uv, 0) );
// forward chain: step by v.xy scaled by (1-t), re-read the flow there, use its .xy
qF   = ( pc + vec2(v.xy * h0) ) / S;
wF   = f16vec2( textureLod(X, qF, 0).xy );
uvF(X) = ( pc + vec2(wF) ) / S;
// backward chain: step by v.zw scaled by t, re-read, use its .zw
qB   = ( pc + vec2(v.zw * h1) ) / S;
wB   = f16vec2( textureLod(X, qB, 0).zw );
uvB(X) = ( pc + vec2(wB) ) / S;
```

(The fp16 products are converted to fp32 before adding to `pc`.) This yields four
positions: `uv0 = uvF(P)`, `uv1 = uvB(P)`, `uv2 = uvF(Q)`, `uv3 = uvB(Q)`.

### 2.2 Correlation bundle

Define `Corr(F, G, uvX)` where `F ∈ {A, B}` is the "moving" 4-texture set sampled
at `uvX`, and `G` is the other set read in the integer 3×3 neighborhood of `p`:

```
f_i = f16vec4( textureLod(F_i, uvX, 0) ),  i = 0..3

taps:
  center (0,0):  g_i(0,0) = f16vec4( textureLod(G_i, uv, 0) )        // SAMPLED at uv
  o ≠ (0,0):     g_i(o)   = f16vec4( texelFetch(G_i, clamp(p + o, ivec2(0), szm1), 0) )

c(o) = ((dot(f_0, g_0(o)) + dot(f_1, g_1(o))) + dot(f_2, g_2(o))) + dot(f_3, g_3(o))
```

Note the asymmetry: the 8 neighbor taps are integer fetches clamped to the image
rect (of the size of binding 32), while the center tap is a normalized-coordinate
sample at `uv` through the external sampler.

The 9 costs are normalized, clamped and packed as (offset order is `(dx,dy)`):

```
q1 = clamp( (( c(-1,-1), c(0,-1), c(1,-1), c(-1,0) ) - N1m) * N1s + N1b, 0, 1 )
q2 = clamp( (( c(0,0),   c(1,0),  c(-1,1), c(0,1)  ) - N2m) * N2s + N2b, 0, 1 )
s  = clamp( ( c(1,1) - 4.6640625 ) * 0.54345703125 + (-0.2110595703125), 0, 1 )
```

Normalization constants (binary16-exact; same for all four bundles):

| const | x | y | z | w |
|---|---|---|---|---|
| N1m | 4.66015625 | 4.79296875 | 4.64453125 | 4.90625 |
| N1s | 0.61474609375 | 0.41455078125 | 0.3701171875 | 0.501953125 |
| N1b | -0.34375 | 0.11907958984375 | -0.1085205078125 | -0.01666259765625 |
| N2m | 5.34765625 | 4.90625 | 4.64453125 | 4.796875 |
| N2s | 0.236328125 | 0.42919921875 | 0.289794921875 | 0.44091796875 |
| N2b | 0.453125 | 0.2607421875 | 0.08062744140625 | 0.0902099609375 |

Scalar norm in hex-float: mean `0x1.2a8p+2`, scale `0x1.164p-1`, bias `-0x1.b04p-3`.

The four bundles computed are:

```
K0 = Corr(A @ uv0, B)      // A features chased along P-forward, vs B around p
K1 = Corr(A @ uv2, B)      // A chased along Q-forward, vs B
K2 = Corr(B @ uv1, A)      // B chased along P-backward, vs A
K3 = Corr(B @ uv3, A)      // B chased along Q-backward, vs A
```

(K0 and K1 share the same `g` taps of set B; K2 and K3 share the taps of set A.)

### 2.3 Dense mixing layer and outputs

Each output is an affine map of a weighted sum over all 36 bundle values. With
`M·v` meaning a 4×4 fp16 matrix times vec4 (`out[r] = dot(row_r, v)`), and the sum
accumulated left-to-right in exactly this order (fp16 adds):

```
acc(W) =  W.M00·K0.q1 + W.M01·K0.q2 + W.V0*K0.s
        + W.M20·K2.q1 + W.M21·K2.q2 + W.V2*K2.s
        + W.M10·K1.q1 + W.M11·K1.q2 + W.V1*K1.s
        + W.M30·K3.q1 + W.M31·K3.q2 + W.V3*K3.s

out48[p] = vec4( (acc(W48) - O48m) * O48s + O48b )   // fp16 → fp32 → rgba8 store
out49[p] = vec4( (acc(W49) - O49m) * O49s + O49b )
```

No explicit clamp before the store; the `rgba8` unorm format clamps to [0,1] and
quantizes at store time.

Interpretation hint (not normative): four cost volumes (two flow fields × two
directions) are quantization-normalized and fed through one 36→8 fully-connected
layer; the output affine maps re-quantize the 8 activations for unorm storage.

## 3. Constants of the dense layer (all binary16-exact; decimals uniquely identify the bit pattern)

Matrix rows are printed as `[w0, w1, w2, w3]`; `out[r] = dot(row_r, input_quad)`,
rows in order r = 0..3 (output channels x,y,z,w). `V*` are per-channel weight
vectors multiplied by the scalar cost `s` of that bundle.

### Output 0 (binding 48), weight set W48

M00 (x K0.q1):
   [0.084228515625, -0.037353515625, -0.041534423828125, 0.08636474609375]
   [0.1263427734375, -0.07769775390625, 0.02191162109375, -0.0233001708984375]
   [0.06903076171875, 0.1834716796875, 0.096435546875, 0.04931640625]
   [-0.33740234375, -0.33349609375, 0.0035152435302734375, -0.335693359375]
M01 (x K0.q2):
   [0.125, -0.1964111328125, 0.0194244384765625, 0.08056640625]
   [0.152587890625, -0.126220703125, 0.141845703125, 0.0266265869140625]
   [0.251953125, 0.2174072265625, -0.015869140625, 0.08819580078125]
   [-0.1832275390625, -0.2156982421875, -0.27392578125, -0.475341796875]
V0 (x K0.s): (0.050933837890625, 0.03753662109375, 0.0916748046875, -0.31201171875)
M20 (x K2.q1):
   [-0.054168701171875, 0.038665771484375, -0.026031494140625, -0.10418701171875]
   [-0.2283935546875, -0.1536865234375, -0.04046630859375, -0.310791015625]
   [0.0189056396484375, 0.01367950439453125, -0.09637451171875, 0.049835205078125]
   [0.00545501708984375, -0.146728515625, 0.0860595703125, -0.022674560546875]
M21 (x K2.q2):
   [0.11053466796875, 0.0804443359375, -0.1878662109375, -0.1099853515625]
   [-0.08685302734375, -0.09515380859375, -0.09637451171875, -0.32421875]
   [-0.055450439453125, -0.09613037109375, 0.07147216796875, 0.06884765625]
   [0.256103515625, -0.1787109375, -0.06427001953125, -0.080078125]
V2 (x K2.s): (-0.031280517578125, -0.2337646484375, -0.0787353515625, 0.051483154296875)
M10 (x K1.q1):
   [0.1856689453125, -0.103271484375, -0.10601806640625, 0.27392578125]
   [0.1527099609375, 0.279541015625, 0.1771240234375, 0.049102783203125]
   [0.08477783203125, -0.03338623046875, -0.056243896484375, -0.040435791015625]
   [0.04296875, 0.02252197265625, -0.04718017578125, 0.2376708984375]
M11 (x K1.q2):
   [-0.12152099609375, -0.201416015625, 0.261474609375, 0.19580078125]
   [0.10760498046875, 0.14111328125, -0.0283966064453125, 0.08740234375]
   [-0.04412841796875, -0.004535675048828125, -0.0010519027709960938, -0.0859375]
   [0.13525390625, 0.04058837890625, -0.0110931396484375, 0.1695556640625]
V1 (x K1.s): (-0.1436767578125, 0.24609375, -0.035247802734375, -0.08746337890625)
M30 (x K3.q1):
   [-0.186767578125, 0.044586181640625, 0.1192626953125, -0.197021484375]
   [0.1082763671875, -0.04852294921875, -0.1304931640625, 0.1298828125]
   [-0.10791015625, -0.10052490234375, -0.011016845703125, -0.1949462890625]
   [0.051788330078125, 0.320556640625, 0.2498779296875, 0.1866455078125]
M31 (x K3.q2):
   [-0.20654296875, 0.2454833984375, -0.136962890625, -0.345458984375]
   [0.0113677978515625, 0.037750244140625, 0.1578369140625, 0.1524658203125]
   [-0.209228515625, -0.06378173828125, -0.01239776611328125, -0.0931396484375]
   [0.40185546875, 0.1748046875, -0.1484375, 0.144775390625]
V3 (x K3.s): (0.163818359375, 0.05706787109375, 0.0005230903625488281, 0.17626953125)

Output affine: O48m = (-0.09844970703125, 0.11541748046875, -0.034637451171875, 0.1334228515625);
O48s = (5.953125, 4.66015625, 4.6328125, 2.9296875);
O48b = (-0.0016355514526367188, 0.22119140625, 0.1632080078125, 0.1156005859375).

### Output 1 (binding 49), weight set W49

M00 (x K0.q1):
   [0.17138671875, 0.177734375, 0.138916015625, 0.15283203125]
   [0.0787353515625, -0.07293701171875, 0.082763671875, -0.08148193359375]
   [0.0225982666015625, 0.0325927734375, 0.037322998046875, -0.06927490234375]
   [0.12139892578125, 0.2139892578125, 0.07806396484375, 0.2459716796875]
M01 (x K0.q2):
   [-0.039031982421875, 0.0999755859375, 0.118896484375, 0.15966796875]
   [-0.1368408203125, -0.036529541015625, 0.0816650390625, -0.090087890625]
   [0.10089111328125, 0.0223846435546875, -0.04541015625, -0.11126708984375]
   [0.54296875, 0.0943603515625, 0.092529296875, 0.1903076171875]
V0 (x K0.s): (0.1949462890625, 0.09661865234375, 0.0122528076171875, 0.2120361328125)
M20 (x K2.q1):
   [-0.07342529296875, -0.0176239013671875, 0.03924560546875, 0.01009368896484375]
   [-0.26513671875, -0.30126953125, -0.2047119140625, -0.3359375]
   [-0.036102294921875, -0.0684814453125, -0.10369873046875, 0.10858154296875]
   [-0.062744140625, 0.019256591796875, -0.0614013671875, -0.05120849609375]
M21 (x K2.q2):
   [-0.1982421875, -0.0188751220703125, 0.0272216796875, -0.0080413818359375]
   [-0.482666015625, -0.200439453125, -0.06982421875, -0.251708984375]
   [0.2379150390625, -0.11962890625, -0.10894775390625, 0.09930419921875]
   [0.044342041015625, 0.05950927734375, -0.12493896484375, 0.023834228515625]
V2 (x K2.s): (-0.04339599609375, -0.22314453125, -0.0885009765625, -0.077392578125)
M10 (x K1.q1):
   [-0.0018291473388671875, -0.00991058349609375, -0.07147216796875, 0.059173583984375]
   [0.0164031982421875, 0.055450439453125, -0.042205810546875, 0.05706787109375]
   [-0.2025146484375, 0.1937255859375, 0.169921875, -0.324462890625]
   [-0.1600341796875, -0.211669921875, -0.191650390625, -0.2325439453125]
M11 (x K1.q2):
   [0.8330078125, -0.1278076171875, -0.1534423828125, -0.039093017578125]
   [-0.0219573974609375, 0.004306793212890625, -0.07159423828125, -0.022308349609375]
   [-0.255126953125, 0.25390625, -0.226318359375, -0.46142578125]
   [0.145263671875, -0.2763671875, -0.345703125, -0.280029296875]
V1 (x K1.s): (-0.039093017578125, -0.0806884765625, 0.1533203125, -0.13134765625)
M30 (x K3.q1):
   [-0.1458740234375, -0.2412109375, -0.0206756591796875, -0.1263427734375]
   [-0.024749755859375, 0.16162109375, 0.071044921875, 0.10711669921875]
   [0.2379150390625, -0.341552734375, -0.09423828125, 0.382080078125]
   [-0.12396240234375, -0.04632568359375, 0.0146484375, -0.041351318359375]
M31 (x K3.q2):
   [0.51025390625, -0.15234375, -0.10357666015625, -0.1815185546875]
   [0.02880859375, 0.2138671875, 0.1695556640625, 0.229248046875]
   [-0.10406494140625, -0.2978515625, 0.217041015625, 0.2861328125]
   [0.06494140625, 0.0728759765625, 0.065673828125, 0.09600830078125]
V3 (x K3.s): (-0.055450439453125, 0.1341552734375, -0.1595458984375, 0.10400390625)

Output affine: O49m = (0.390869140625, -0.35009765625, -0.1348876953125, 0.2462158203125);
O49s = (2.1328125, 4.02734375, 5.4765625, 5.1796875);
O49b = (0.1199951171875, 0.17041015625, 0.1051025390625, 0.69140625).


## 4. Control flow

No loops (fully unrolled). Single conditional: bounds check against
`imageSize(out48)` → early return.

## 5. Boundary behavior

- Write guard tests only binding 48's size; binding 49 is written at the same `p`
  unguarded (outputs must be size-matched).
- The 8 neighbor taps of each cost volume ARE clamped:
  `clamp(p + o, ivec2(0), textureSize(A0,0) - 1)` (note: the clamp limit comes from
  binding 32's size for both the A- and B-set fetches).
- The center tap and all flow-chase reads are normalized-coordinate samples with no
  clamp; out-of-[0,1] behavior comes from the external samplers.
- All sampling/fetching at explicit LOD 0.
