import assert from "node:assert/strict";
import test from "node:test";
import { PRESETS, detectPreset, outputFps, suggestBaseCap } from "../src/utils/presets.ts";

test("every preset is detected from its own values", () => {
  for (const preset of PRESETS) {
    assert.equal(detectPreset(preset.values), preset.id);
  }
});

test("unmatched values are reported as custom", () => {
  assert.equal(detectPreset({ flow_scale: 0.63, performance_mode: false }), null);
});

test("output fps multiplies the cap and ignores an unset cap", () => {
  assert.equal(outputFps(30, 2), 60);
  assert.equal(outputFps(30, 3), 90);
  assert.equal(outputFps(0, 2), null);
});

test("suggested base cap divides the refresh rate evenly", () => {
  assert.equal(suggestBaseCap(60, 2), 30);
  assert.equal(suggestBaseCap(90, 3), 30);
  assert.equal(suggestBaseCap(90, 2), 45);
  assert.equal(suggestBaseCap(60, 4), 15);
  assert.equal(suggestBaseCap(60, 7), null);
  assert.equal(suggestBaseCap(60, 1), null);
});
