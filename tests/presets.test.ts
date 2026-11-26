import assert from "node:assert/strict";
import test from "node:test";
import { PACING_TARGETS, PRESETS, detectPacingTarget, detectPreset, outputFps, summarizeConfig } from "../src/utils/presets.ts";

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

test("every pacing target lands on 60 or 90 FPS and is detected", () => {
  for (const target of PACING_TARGETS) {
    assert.ok([60, 90].includes(target.cap * target.multiplier));
    assert.equal(detectPacingTarget(target.cap, target.multiplier), target.id);
  }
  assert.equal(detectPacingTarget(35, 2), null);
});

test("summaries name presets and spell out custom values", () => {
  assert.equal(summarizeConfig({ multiplier: 3, flow_scale: 0.8, performance_mode: false }), "3x · Balanced");
  assert.equal(summarizeConfig({ multiplier: 2, flow_scale: 0.65, performance_mode: true }), "2x · 65% light model");
  assert.equal(summarizeConfig({ multiplier: 2, flow_scale: 0.65, performance_mode: false }), "2x · 65%");
  assert.equal(summarizeConfig({ multiplier: 1, flow_scale: 1, performance_mode: false }), "1x · Quality");
});
