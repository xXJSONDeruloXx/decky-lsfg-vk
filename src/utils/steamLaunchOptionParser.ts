export interface WorkaroundState {
  dxvkFrameRate: number;
  disableGamescopeWsi: boolean;
  disableHdr: boolean;
  disableSteamdeckMode: boolean;
  disableVkbasalt: boolean;
  enableZink: boolean;
}

export type WorkaroundField = keyof WorkaroundState;

export interface ParsedWorkaroundOptions {
  state: WorkaroundState;
  issues: string[];
}

interface LaunchToken {
  raw: string;
  value: string;
}

interface EnvironmentEntry {
  value: string;
  count: number;
}

type BooleanWorkaroundField = Exclude<WorkaroundField, "dxvkFrameRate">;
type EnvironmentSpec = readonly [key: string, value: string];
type DxvkFrameRateKey = "dxvk.maxFrameRate" | "dxgi.maxFrameRate" | "d3d9.maxFrameRate";

interface WorkaroundDefinition {
  spec: EnvironmentSpec;
  clear: readonly string[];
  label?: string;
}

const COMMAND_TOKEN = "%command%";
const LEGACY_WRAPPER_TOKENS = new Set([
  "~/lsfg",
  "/home/deck/lsfg",
  "~/.local/bin/lsfg-vk-experimental",
  "/home/deck/.local/bin/lsfg-vk-experimental",
  "~/.local/bin/mako-run",
  "/home/deck/.local/bin/mako-run",
  "mako-run",
  "~/.local/bin/mako-launch",
  "/home/deck/.local/bin/mako-launch",
  "mako-launch",
]);
const DXVK_FRAME_RATE_KEYS: readonly DxvkFrameRateKey[] = [
  "dxvk.maxFrameRate",
  "dxgi.maxFrameRate",
  "d3d9.maxFrameRate",
];
const DXVK_MANAGED_KEYS = new Set(["DXVK_CONFIG", "DXVK_FRAME_RATE"]);
const WORKAROUND_DEFINITIONS = {
  disableGamescopeWsi: {
    spec: ["ENABLE_GAMESCOPE_WSI", "0"],
    clear: ["DISABLE_GAMESCOPE_WSI", "ENABLE_GAMESCOPE_WSI"],
  },
  disableHdr: {
    spec: ["DXVK_HDR", "0"],
    clear: ["DXVK_HDR"],
    label: "Disable HDR",
  },
  disableSteamdeckMode: {
    spec: ["SteamDeck", "0"],
    clear: ["SteamDeck"],
    label: "Steam Deck mode",
  },
  disableVkbasalt: {
    spec: ["DISABLE_VKBASALT", "1"],
    clear: ["DISABLE_VKBASALT"],
    label: "Disable vkBasalt",
  },
  enableZink: {
    spec: ["MESA_LOADER_DRIVER_OVERRIDE", "zink"],
    clear: ["__GLX_VENDOR_LIBRARY_NAME", "MESA_LOADER_DRIVER_OVERRIDE", "GALLIUM_DRIVER"],
  },
} as const satisfies Record<BooleanWorkaroundField, WorkaroundDefinition>;
const BOOLEAN_WORKAROUND_FIELDS: readonly BooleanWorkaroundField[] = [
  "disableGamescopeWsi",
  "disableHdr",
  "disableSteamdeckMode",
  "disableVkbasalt",
  "enableZink",
];
const WSI_DISABLE_KEY = "DISABLE_GAMESCOPE_WSI";
const WSI_ENABLE_KEY = "ENABLE_GAMESCOPE_WSI";
const WORKAROUND_ENV_KEYS = new Set(
  BOOLEAN_WORKAROUND_FIELDS.flatMap((field) => WORKAROUND_DEFINITIONS[field].clear),
);
const MANAGED_ENV_KEYS = new Set([
  ...DXVK_MANAGED_KEYS,
  ...WORKAROUND_ENV_KEYS,
]);

const EMPTY_WORKAROUND_STATE: WorkaroundState = {
  dxvkFrameRate: 0,
  disableGamescopeWsi: false,
  disableHdr: false,
  disableSteamdeckMode: false,
  disableVkbasalt: false,
  enableZink: false,
};
const DEFAULT_WORKAROUND_STATE: WorkaroundState = {
  ...EMPTY_WORKAROUND_STATE,
  disableGamescopeWsi: true,
  disableHdr: true,
};

export function getDefaultWorkaroundState(): WorkaroundState {
  return { ...DEFAULT_WORKAROUND_STATE };
}

function decodeToken(raw: string): string {
  let value = "";
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === "\\" && quote !== "'" && index + 1 < raw.length) {
      value += raw[index + 1];
      index += 1;
    } else if (quote !== null) {
      if (character === quote) quote = null;
      else value += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else {
      value += character;
    }
  }

  return value;
}

function tokenize(options: string): LaunchToken[] {
  const tokens: LaunchToken[] = [];
  let start = -1;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < options.length; index += 1) {
    const character = options[index];
    if (start < 0) {
      if (/\s/.test(character)) continue;
      start = index;
    }

    if (escaped) {
      escaped = false;
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      const raw = options.slice(start, index);
      tokens.push({ raw, value: decodeToken(raw) });
      start = -1;
    }
  }

  if (start >= 0) {
    const raw = options.slice(start);
    tokens.push({ raw, value: decodeToken(raw) });
  }
  return tokens;
}

function serialize(tokens: readonly LaunchToken[]): string {
  if (tokens.length === 1 && tokens[0].raw.toLowerCase() === COMMAND_TOKEN) return "";
  return tokens.map((token) => token.raw).join(" ");
}

export function normalizeLaunchOptions(options: string): string {
  return serialize(tokenize(options));
}

function parseEnvironmentToken(token: LaunchToken): [string, string] | null {
  const separator = token.value.indexOf("=");
  if (separator < 1) return null;
  const key = token.value.slice(0, separator);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  return [key, token.value.slice(separator + 1)];
}

function findCommandIndex(tokens: readonly LaunchToken[]): number {
  return tokens.findIndex((token) => token.raw.toLowerCase() === COMMAND_TOKEN);
}

function leadingEnvironmentCount(tokens: readonly LaunchToken[]): number {
  let count = 0;
  while (count < tokens.length && parseEnvironmentToken(tokens[count]) !== null) count += 1;
  return count;
}

function effectivePrefixLimit(tokens: readonly LaunchToken[]): number {
  return leadingEnvironmentCount(tokens);
}

function effectiveEnvironmentEntries(tokens: readonly LaunchToken[]): Map<string, EnvironmentEntry> {
  const entries = new Map<string, EnvironmentEntry>();
  for (let index = 0; index < effectivePrefixLimit(tokens); index += 1) {
    const parsed = parseEnvironmentToken(tokens[index]);
    if (!parsed) continue;
    const [key, value] = parsed;
    const previous = entries.get(key);
    entries.set(key, { value, count: (previous?.count || 0) + 1 });
  }
  return entries;
}

function removePrefixAssignments(tokens: LaunchToken[], predicate: (token: LaunchToken) => boolean): boolean {
  const limit = effectivePrefixLimit(tokens);
  const retained = tokens.filter((token, index) => index >= limit || !predicate(token));
  if (retained.length === tokens.length) return false;
  tokens.splice(0, tokens.length, ...retained);
  return true;
}

function removeAllAssignments(tokens: LaunchToken[], keys: ReadonlySet<string>): boolean {
  return removePrefixAssignments(tokens, (token) => {
    const parsed = parseEnvironmentToken(token);
    return parsed !== null && keys.has(parsed[0]);
  });
}

function encodeEnvironmentValue(value: string): string {
  if (/^[A-Za-z0-9_./:+,%=-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function insertEnvironmentSpecs(tokens: LaunchToken[], specs: readonly EnvironmentSpec[]): void {
  tokens.unshift(...specs.map(([key, value]) => ({
    raw: `${key}=${encodeEnvironmentValue(value)}`,
    value: `${key}=${value}`,
  })));
}

function ensureCommandToken(tokens: LaunchToken[]): void {
  if (findCommandIndex(tokens) >= 0) return;
  tokens.splice(leadingEnvironmentCount(tokens), 0, { raw: COMMAND_TOKEN, value: COMMAND_TOKEN });
}

export function isLegacyWrapperToken(value: string): boolean {
  const path = decodeToken(value);
  return LEGACY_WRAPPER_TOKENS.has(path);
}

function removeLegacyWrapperFromTokens(tokens: LaunchToken[]): boolean {
  const commandIndex = findCommandIndex(tokens);
  const prefixEnd = commandIndex >= 0 ? commandIndex : tokens.length;
  const retained = tokens.filter((token, index) => index >= prefixEnd || !isLegacyWrapperToken(token.raw));
  if (retained.length === tokens.length) return false;
  tokens.splice(0, tokens.length, ...retained);
  return true;
}

interface DxvkConfigAssignment {
  values: string[];
  malformed: number;
}

interface ParsedDxvkConfig {
  segments: string[];
  assignments: Map<DxvkFrameRateKey, DxvkConfigAssignment>;
}

function splitDxvkConfig(value: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) escaped = false;
    else if (character === "\\" && quote !== "'") escaped = true;
    else if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === "'" || character === '"') quote = character;
    else if (character === ";") {
      segments.push(value.slice(start, index));
      start = index + 1;
    }
  }

  segments.push(value.slice(start));
  return segments;
}

function knownDxvkKey(value: string): DxvkFrameRateKey | null {
  const key = value.match(/^([A-Za-z][A-Za-z0-9.]*)/)?.[1];
  return key && DXVK_FRAME_RATE_KEYS.includes(key as DxvkFrameRateKey)
    ? key as DxvkFrameRateKey
    : null;
}

function parseDxvkConfig(value: string): ParsedDxvkConfig {
  const segments = splitDxvkConfig(value);
  const assignments = new Map<DxvkFrameRateKey, DxvkConfigAssignment>();
  for (const segment of segments) {
    const trimmed = segment.trim();
    const key = knownDxvkKey(trimmed);
    if (!key) continue;
    const match = trimmed.match(/^[A-Za-z][A-Za-z0-9.]*\s*=\s*(.*?)\s*$/);
    const entry = assignments.get(key) || { values: [], malformed: 0 };
    if (match) entry.values.push(match[1]);
    else entry.malformed += 1;
    assignments.set(key, entry);
  }
  return { segments, assignments };
}

function isDxvkFrameRateSegment(segment: string): boolean {
  return knownDxvkKey(segment.trim()) !== null;
}

function parseSupportedFrameRate(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) && numericValue <= 60 ? numericValue : null;
}

function rewriteDxvkFrameRate(tokens: LaunchToken[], frameRate: number): void {
  const config = effectiveEnvironmentEntries(tokens).get("DXVK_CONFIG");
  const parsed = parseDxvkConfig(config?.value || "");
  const retained = parsed.segments
    .filter((segment) => !isDxvkFrameRateSegment(segment))
    .filter((segment) => segment.trim().length > 0)
    .join(";");
  const nextConfig = frameRate > 0
    ? [`dxvk.maxFrameRate = ${frameRate}`, ...(retained ? [retained] : [])].join(";")
    : retained;

  removeAllAssignments(tokens, DXVK_MANAGED_KEYS);
  if (nextConfig) {
    ensureCommandToken(tokens);
    insertEnvironmentSpecs(tokens, [["DXVK_CONFIG", nextConfig]]);
  }
}

function environmentSpecsForState(state: WorkaroundState): EnvironmentSpec[] {
  return BOOLEAN_WORKAROUND_FIELDS
    .filter((field) => state[field])
    .map((field) => WORKAROUND_DEFINITIONS[field].spec);
}

function validateFrameRate(frameRate: number): void {
  if (!Number.isInteger(frameRate) || frameRate < 0 || frameRate > 60) {
    throw new Error("Base FPS Cap must be an integer from 0 to 60");
  }
}

function readBoolean(
  entries: Map<string, EnvironmentEntry>,
  key: string,
  label: string,
  trueValue: string,
  issues: string[],
): boolean {
  const entry = entries.get(key);
  if (!entry) return false;
  const falseValue = trueValue === "1" ? "0" : "1";
  if (entry.value === trueValue) return true;
  if (entry.value === falseValue) return false;
  issues.push(`${label} has an unsupported value.`);
  return false;
}

export function parseWorkaroundOptions(options: string): ParsedWorkaroundOptions {
  const tokens = tokenize(options);
  const entries = effectiveEnvironmentEntries(tokens);
  const state = { ...EMPTY_WORKAROUND_STATE };
  const issues: string[] = [];

  for (const [key, entry] of entries) {
    if (MANAGED_ENV_KEYS.has(key) && entry.count > 1) {
      issues.push(`${key} appears more than once; Steam uses the last value.`);
    }
  }

  const dxvkConfig = parseDxvkConfig(entries.get("DXVK_CONFIG")?.value || "");
  const effectiveDxvkValues = new Map<DxvkFrameRateKey, number | null>();
  for (const key of DXVK_FRAME_RATE_KEYS) {
    const assignment = dxvkConfig.assignments.get(key);
    if (!assignment) continue;
    if (assignment.malformed > 0) issues.push(`${key} in DXVK_CONFIG is malformed.`);
    if (assignment.values.length > 1) {
      issues.push(`${key} appears more than once in DXVK_CONFIG; DXVK uses the last value.`);
    }
    if (assignment.values.length === 0) continue;
    const value = parseSupportedFrameRate(assignment.values[assignment.values.length - 1]);
    effectiveDxvkValues.set(key, value);
    if (value === null) issues.push(`${key} in DXVK_CONFIG is outside the supported 0-60 range.`);
  }

  const unifiedFrameRate = effectiveDxvkValues.get("dxvk.maxFrameRate");
  const dxgiFrameRate = effectiveDxvkValues.get("dxgi.maxFrameRate");
  const d3d9FrameRate = effectiveDxvkValues.get("d3d9.maxFrameRate");
  if (unifiedFrameRate !== undefined) {
    if (unifiedFrameRate !== null) state.dxvkFrameRate = unifiedFrameRate;
  } else if (dxgiFrameRate !== undefined && d3d9FrameRate !== undefined) {
    if (dxgiFrameRate !== null && dxgiFrameRate === d3d9FrameRate) state.dxvkFrameRate = dxgiFrameRate;
    else issues.push("DXVK_CONFIG has conflicting or invalid DirectX frame caps.");
  } else if (dxgiFrameRate !== undefined || d3d9FrameRate !== undefined) {
    const partial = dxgiFrameRate ?? d3d9FrameRate;
    if (partial !== null && partial !== undefined) state.dxvkFrameRate = partial;
    issues.push("DXVK_CONFIG only caps one DirectX API; adjust the cap to normalize it.");
  }

  if (entries.has("DXVK_FRAME_RATE")) {
    issues.push("DXVK_FRAME_RATE is obsolete on current DXVK; adjust the cap to migrate it.");
  }

  const wsiSignals: boolean[] = [];
  const wsiDisable = entries.get(WSI_DISABLE_KEY);
  if (wsiDisable) {
    if (wsiDisable.value !== "0" && wsiDisable.value !== "1") issues.push("Disable Gamescope WSI has an unsupported value.");
    else wsiSignals.push(wsiDisable.value === "1");
  }
  const wsiEnable = entries.get(WSI_ENABLE_KEY);
  if (wsiEnable) {
    if (wsiEnable.value !== "0" && wsiEnable.value !== "1") issues.push("Enable Gamescope WSI has an unsupported value.");
    else wsiSignals.push(wsiEnable.value === "0");
  }
  if (wsiSignals.length > 0) {
    if (wsiSignals.length === 2 && wsiSignals[0] !== wsiSignals[1]) {
      issues.push("Gamescope WSI has conflicting enable and disable assignments.");
    }
    state.disableGamescopeWsi = wsiSignals.some(Boolean);
  }

  for (const field of ["disableHdr", "disableSteamdeckMode", "disableVkbasalt"] as const) {
    const { spec, label } = WORKAROUND_DEFINITIONS[field];
    state[field] = readBoolean(entries, spec[0], label || field, spec[1], issues);
  }

  const vkBasaltEnable = entries.get("ENABLE_VKBASALT");
  const vkBasaltDisable = entries.get("DISABLE_VKBASALT");
  if (vkBasaltEnable?.value === "1" && vkBasaltDisable?.value === "1") {
    issues.push("vkBasalt has conflicting enable and disable assignments.");
  }

  const zink = entries.get(WORKAROUND_DEFINITIONS.enableZink.spec[0]);
  const glxVendor = entries.get("__GLX_VENDOR_LIBRARY_NAME");
  const galliumDriver = entries.get("GALLIUM_DRIVER");
  const hasLegacyZink = glxVendor !== undefined || galliumDriver !== undefined;
  if (zink || hasLegacyZink) {
    state.enableZink = zink?.value === WORKAROUND_DEFINITIONS.enableZink.spec[1];
    if (hasLegacyZink && (
      glxVendor?.value !== "mesa" ||
      zink?.value !== WORKAROUND_DEFINITIONS.enableZink.spec[1] ||
      galliumDriver?.value !== "zink"
    )) {
      issues.push("Zink workaround is only partially configured.");
    } else if (!state.enableZink) {
      issues.push("Zink workaround has an unsupported driver value.");
    }
  }

  return { state, issues };
}

export function applyWorkaroundState(options: string, state: WorkaroundState): string {
  validateFrameRate(state.dxvkFrameRate);
  const tokens = tokenize(options);
  removeLegacyWrapperFromTokens(tokens);
  rewriteDxvkFrameRate(tokens, state.dxvkFrameRate);
  const keysToClear = new Set<string>(
    WORKAROUND_ENV_KEYS,
  );
  if (state.disableVkbasalt) keysToClear.add("ENABLE_VKBASALT");
  removeAllAssignments(tokens, keysToClear);
  const specs = environmentSpecsForState(state);
  if (specs.length > 0) {
    ensureCommandToken(tokens);
    insertEnvironmentSpecs(tokens, specs);
  }
  return serialize(tokens);
}

export function applyWorkaroundChange(options: string, field: WorkaroundField, value: boolean | number): string {
  const tokens = tokenize(options);
  removeLegacyWrapperFromTokens(tokens);

  if (field === "dxvkFrameRate") {
    if (typeof value !== "number") throw new Error("Base FPS Cap must be an integer from 0 to 60");
    validateFrameRate(value);
    rewriteDxvkFrameRate(tokens, value);
    return serialize(tokens);
  }

  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  const definition = WORKAROUND_DEFINITIONS[field];
  const keysToClear = new Set<string>(definition.clear);
  if (value && field === "disableVkbasalt") keysToClear.add("ENABLE_VKBASALT");
  removeAllAssignments(tokens, keysToClear);
  if (value) {
    ensureCommandToken(tokens);
    insertEnvironmentSpecs(tokens, [definition.spec]);
  }
  return serialize(tokens);
}

export function cleanupLegacyLaunchOptions(options: string): string {
  const tokens = tokenize(options);
  removeLegacyWrapperFromTokens(tokens);
  return serialize(tokens);
}

export function cleanupPluginLaunchOptions(options: string): string {
  const tokens = tokenize(options);
  removeLegacyWrapperFromTokens(tokens);
  rewriteDxvkFrameRate(tokens, 0);
  removeAllAssignments(tokens, WORKAROUND_ENV_KEYS);
  return serialize(tokens);
}

export function cleanupLegacyWrapper(options: string): string {
  return cleanupLegacyLaunchOptions(options);
}
