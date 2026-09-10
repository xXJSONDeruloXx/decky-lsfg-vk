import type { TargetTransport } from "../api/lsfgApi";

const DEFAULT_WRAPPER_PATH = "~/.lsfg";
const COMMAND_TOKEN = "%command%";
const DIRECT_FLATPAK_EXECUTABLE = "/usr/bin/flatpak";

export const LEGACY_WRAPPER_TOKENS = new Set([
  "~/lsfg",
  "~/.local/bin/lsfg",
  "~/.local/bin/lsfg-vk-experimental",
  "~/.local/bin/mako-run",
  "mako-run",
  "~/.local/bin/mako-launch",
  "mako-launch",
]);

const LEGACY_ABSOLUTE_WRAPPER = /^\/(?:home|Users)\/[^/]+\/(?:lsfg|\.local\/bin\/(?:lsfg|lsfg-vk-experimental|mako-run|mako-launch))$/;
const MANAGED_ENV_KEYS = new Set([
  "ENABLE_GAMESCOPE_WSI", "DISABLE_GAMESCOPE_WSI", "DXVK_HDR", "SteamDeck",
  "DISABLE_VKBASALT", "ENABLE_VKBASALT", "MESA_LOADER_DRIVER_OVERRIDE",
  "__GLX_VENDOR_LIBRARY_NAME", "GALLIUM_DRIVER", "DXVK_FRAME_RATE",
]);
const DXVK_FRAME_RATE_SEGMENT = /^(?:dxvk\.maxFrameRate|dxgi\.maxFrameRate|d3d9\.maxFrameRate)\s*=/i;

interface LaunchToken { raw: string; value: string; }
export interface SteamLaunchOptionsSnapshot {
  appId: number;
  nonSteam: boolean;
  options: string;
  target: string;
  details: SteamAppDetails;
}
export interface WrapperIntegrationResult {
  snapshot: SteamLaunchOptionsSnapshot;
  originalExecutable?: string;
  commandTokenAdded: boolean;
  changed: boolean;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function apps(): Partial<SteamApps> | undefined {
  return (globalThis as typeof globalThis & { SteamClient?: { Apps?: Partial<SteamApps> } }).SteamClient?.Apps;
}

function validateAppId(appId: number): void {
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new Error("Invalid Steam App ID");
}

function timer() {
  const host = typeof window !== "undefined" ? window : globalThis;
  return {
    set: (handler: () => void, ms: number) => host.setTimeout(handler, ms) as unknown as number,
    clear: (id: number) => host.clearTimeout(id),
  };
}

export function normalizeShortcutTarget(executable?: string | null, startDir?: string | null): string {
  const target = typeof executable === "string" ? executable.trim() : "";
  const normalizedStartDir = typeof startDir === "string" ? startDir.trim().replace(/\/+$/, "") : "";
  return target === "flatpak" && normalizedStartDir === "/usr/bin"
    ? DIRECT_FLATPAK_EXECUTABLE
    : target;
}

function snapshot(appId: number, nonSteam: boolean, details: SteamAppDetails): SteamLaunchOptionsSnapshot {
  return {
    appId,
    nonSteam,
    options: nonSteam ? details.strShortcutLaunchOptions || "" : details.strLaunchOptions || "",
    target: nonSteam ? normalizeShortcutTarget(details.strShortcutExe, details.strShortcutStartDir) : "",
    details,
  };
}

function registerDetails(appId: number, onDetails: (details: SteamAppDetails) => boolean | void): () => void {
  validateAppId(appId);
  const register = apps()?.RegisterForAppDetails;
  if (!register) throw new Error("Steam app-details API is unavailable");
  let active = true;
  let registration: SteamAppDetailsRegistration | undefined;
  const unsubscribe = () => {
    active = false;
    try { registration?.unregister(); } catch {}
  };
  registration = register.call(apps(), appId, (details) => {
    if (active && onDetails(details || {}) === false) unsubscribe();
  });
  if (!active) unsubscribe();
  return unsubscribe;
}

export async function readSteamLaunchOptions(appId: number, nonSteam: boolean): Promise<SteamLaunchOptionsSnapshot> {
  return new Promise((resolve, reject) => {
    let done = false;
    let unsubscribe = () => {};
    const clock = timer();
    const timeout = clock.set(() => finish(new Error("Timed out reading Steam app details")), 5000);
    const finish = (error?: unknown, details?: SteamAppDetails) => {
      if (done) return;
      done = true;
      clock.clear(timeout);
      unsubscribe();
      if (error) reject(asError(error));
      else resolve(snapshot(appId, nonSteam, details || {}));
    };
    try {
      unsubscribe = registerDetails(appId, (details) => {
        finish(undefined, details);
        return false;
      });
    } catch (error) {
      finish(error);
    }
  });
}

export function subscribeSteamLaunchOptions(
  appId: number,
  nonSteam: boolean,
  onSnapshot: (value: SteamLaunchOptionsSnapshot) => void,
  onError: (error: Error) => void,
): () => void {
  return registerDetails(appId, (details) => {
    try { onSnapshot(snapshot(appId, nonSteam, details)); }
    catch (error) { onError(asError(error)); }
  });
}

function decodeToken(raw: string): string {
  let value = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\" && quote !== "'" && i + 1 < raw.length) value += raw[++i];
    else if (quote) { if (c === quote) quote = null; else value += c; }
    else if (c === "'" || c === '"') quote = c;
    else value += c;
  }
  return value;
}

function tokenize(options: string): LaunchToken[] {
  const tokens: LaunchToken[] = [];
  let start = -1;
  let quote: "'" | '"' | null = null;
  let escaped = false;
  const push = (end: number) => {
    if (start < 0) return;
    const raw = options.slice(start, end);
    tokens.push({ raw, value: decodeToken(raw) });
    start = -1;
  };
  for (let i = 0; i < options.length; i++) {
    const c = options[i];
    if (start < 0) { if (/\s/.test(c)) continue; start = i; }
    if (escaped) escaped = false;
    else if (c === "\\" && quote !== "'") escaped = true;
    else if (quote) { if (c === quote) quote = null; }
    else if (c === "'" || c === '"') quote = c;
    else if (/\s/.test(c)) push(i);
  }
  push(options.length);
  return tokens;
}

const serialize = (tokens: readonly LaunchToken[]) => tokens.map(({ raw }) => raw).join(" ");
const commandIndex = (tokens: readonly LaunchToken[]) => tokens.findIndex((token) => token.raw.toLowerCase() === COMMAND_TOKEN);
const isAssignment = (token: LaunchToken) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(token.value);
const isLegacyToken = (value: string) => LEGACY_WRAPPER_TOKENS.has(value) || LEGACY_ABSOLUTE_WRAPPER.test(value);
const isWrapperToken = (value: string, wrapperPath: string) => decodeToken(value) === wrapperPath || isLegacyWrapperToken(value);
const usesShortcutTarget = (nonSteam: boolean, transport: TargetTransport) => nonSteam && transport.kind === "flatpak";

function selectFlatpakExecutable(transport: TargetTransport, candidate?: string | null): string | undefined {
  if (transport.kind !== "flatpak") return undefined;
  const tokens = candidate?.trim() ? tokenize(candidate.trim()) : [];
  return tokens.length === 1 && tokens[0].value === DIRECT_FLATPAK_EXECUTABLE
    ? DIRECT_FLATPAK_EXECUTABLE
    : undefined;
}

function flatpakTargetValue(wrapperPath: string, executable: string): string {
  return `${wrapperPath} ${executable}`;
}

function managedFlatpakExecutable(target: string, wrapperPath: string): string | undefined {
  const tokens = tokenize(target);
  return tokens.length === 2 && tokens[0].value === wrapperPath && tokens[1].value === DIRECT_FLATPAK_EXECUTABLE
    ? DIRECT_FLATPAK_EXECUTABLE
    : undefined;
}

export const normalizeLaunchOptions = (options: string) => serialize(tokenize(options));
export const isLegacyWrapperToken = (value: string) => isLegacyToken(decodeToken(value));

function removeMatchingWrappers(tokens: LaunchToken[], predicate: (value: string) => boolean): boolean {
  const command = commandIndex(tokens);
  const prefixEnd = command >= 0 ? command : tokens.length;
  const kept = tokens.filter((token, i) => i >= prefixEnd || !predicate(token.value));
  if (kept.length === tokens.length) return false;
  tokens.splice(0, tokens.length, ...kept);
  return true;
}

function installLaunchOption(
  options: string,
  wrapperPath = DEFAULT_WRAPPER_PATH,
  shortcutLaunchOptions = false,
) {
  const tokens = tokenize(options);
  removeMatchingWrappers(tokens, isLegacyToken);
  let command = commandIndex(tokens);
  if (command >= 0) {
    if (tokens[command - 1]?.value === wrapperPath) return { options: serialize(tokens), commandTokenAdded: false };
    removeMatchingWrappers(tokens, (value) => decodeToken(value) === wrapperPath);
    command = commandIndex(tokens);
    tokens.splice(command, 0, { raw: wrapperPath, value: wrapperPath });
    return { options: serialize(tokens), commandTokenAdded: false };
  }
  let insertion = 0;
  while (insertion < tokens.length && isAssignment(tokens[insertion])) insertion++;
  if (!shortcutLaunchOptions && insertion < tokens.length && !tokens[insertion].value.startsWith("-")) {
    throw new Error("Launch options do not contain %command%; refusing to guess a launcher command");
  }
  tokens.splice(insertion, 0,
    { raw: wrapperPath, value: wrapperPath },
    { raw: COMMAND_TOKEN, value: COMMAND_TOKEN },
  );
  return { options: serialize(tokens), commandTokenAdded: true };
}

export function installWrapperLaunchOption(options: string, wrapperPath = DEFAULT_WRAPPER_PATH) {
  return installLaunchOption(options, wrapperPath);
}

export function removeWrapperLaunchOption(
  options: string,
  wrapperPath = DEFAULT_WRAPPER_PATH,
  commandTokenAdded = false,
): string {
  const tokens = tokenize(options);
  if (removeMatchingWrappers(tokens, (value) => isWrapperToken(value, wrapperPath)) && commandTokenAdded) {
    const command = commandIndex(tokens);
    if (command >= 0) tokens.splice(command, 1);
  }
  return serialize(tokens);
}

function encodeAssignmentValue(value: string): string {
  return /^[A-Za-z0-9_./:+,%=-]+$/.test(value)
    ? value
    : `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function cleanupPluginAssignments(options: string): string {
  const tokens = tokenize(options);
  const command = commandIndex(tokens);
  const prefixEnd = command >= 0 ? command : tokens.length;
  return serialize(tokens.flatMap((token, i) => {
    if (i >= prefixEnd || !isAssignment(token)) return [token];
    const split = token.value.indexOf("=");
    const key = token.value.slice(0, split);
    if (key === "DXVK_CONFIG") {
      const value = token.value.slice(split + 1).split(";").map((part) => part.trim())
        .filter((part) => part && !DXVK_FRAME_RATE_SEGMENT.test(part)).join("; ");
      return value ? [{ raw: `DXVK_CONFIG=${encodeAssignmentValue(value)}`, value: `DXVK_CONFIG=${value}` }] : [];
    }
    return MANAGED_ENV_KEYS.has(key) ? [] : [token];
  }));
}

export function cleanupLegacyLaunchOptions(options: string): string {
  const tokens = tokenize(options);
  removeMatchingWrappers(tokens, isLegacyToken);
  return serialize(tokens);
}
export const cleanupPluginLaunchOptions = (options: string, wrapperPath = DEFAULT_WRAPPER_PATH) =>
  cleanupPluginAssignments(removeWrapperLaunchOption(options, wrapperPath));
export const cleanupLegacyWrapper = cleanupPluginLaunchOptions;
export function hasWrapperLaunchIntegration(options: string, wrapperPath = DEFAULT_WRAPPER_PATH): boolean {
  const tokens = tokenize(options);
  const command = commandIndex(tokens);
  return command > 0 && tokens[command - 1].value === wrapperPath;
}

export function isWrapperIntegrationInstalled(
  steam: SteamLaunchOptionsSnapshot,
  nonSteam: boolean,
  transport: TargetTransport,
  wrapperPath = DEFAULT_WRAPPER_PATH,
): boolean {
  return usesShortcutTarget(nonSteam, transport)
    ? managedFlatpakExecutable(steam.target, wrapperPath) !== undefined
    : hasWrapperLaunchIntegration(steam.options, wrapperPath);
}

export function assertKnownShortcutTarget(
  steam: SteamLaunchOptionsSnapshot,
  nonSteam: boolean,
  transport: TargetTransport,
  wrapperPath: string,
  originalExecutable?: string | null,
): void {
  if (
    usesShortcutTarget(nonSteam, transport) &&
    (isWrapperToken(steam.target, wrapperPath) || managedFlatpakExecutable(steam.target, wrapperPath) !== undefined) &&
    !originalExecutable
  ) {
    throw new Error("Managed shortcut Target has no saved original executable");
  }
}

const queues = new Map<string, Promise<unknown>>();
function queued<T>(appId: number, nonSteam: boolean, operation: () => Promise<T>): Promise<T> {
  const key = `${nonSteam ? "shortcut" : "app"}:${appId}`;
  const previous = queues.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const cleanup = current.then(
    () => { if (queues.get(key) === cleanup) queues.delete(key); },
    () => { if (queues.get(key) === cleanup) queues.delete(key); },
  );
  queues.set(key, cleanup);
  return current;
}

async function waitFor(
  appId: number,
  nonSteam: boolean,
  matches: (value: SteamLaunchOptionsSnapshot) => boolean,
  message: string,
): Promise<SteamLaunchOptionsSnapshot> {
  const deadline = Date.now() + 5000;
  let lastError: Error | null = null;
  while (Date.now() <= deadline) {
    try {
      const value = await readSteamLaunchOptions(appId, nonSteam);
      if (matches(value)) return value;
    } catch (error) { lastError = asError(error); }
    if (Date.now() < deadline) await new Promise((resolve) => timer().set(resolve as () => void, 100));
  }
  throw lastError ? new Error(`${message}: ${lastError.message}`) : new Error(`${message} before the readback timeout`);
}

async function writeVerified(
  appId: number,
  nonSteam: boolean,
  previous: string,
  next: string,
  write: (value: string) => Promise<void>,
  read: (value: SteamLaunchOptionsSnapshot) => string,
  message: string,
): Promise<SteamLaunchOptionsSnapshot> {
  const normalized = read === readOptions ? normalizeLaunchOptions : (value: string) => value;
  try {
    await write(next);
    return await waitFor(appId, nonSteam, (value) => normalized(read(value)) === normalized(next), message);
  } catch (error) {
    const failure = asError(error);
    try {
      await write(previous);
      await waitFor(appId, nonSteam, (value) => normalized(read(value)) === normalized(previous), `Steam did not restore the previous ${read === readOptions ? "launch options" : "shortcut Target"}`);
    } catch (rollback) {
      throw new Error(`${failure.message}; rollback also failed: ${asError(rollback).message}`);
    }
    throw failure;
  }
}

const readOptions = (value: SteamLaunchOptionsSnapshot) => value.options;
const readTarget = (value: SteamLaunchOptionsSnapshot) => value.target;

function writeOptions(appId: number, nonSteam: boolean, value: string): Promise<void> {
  const setter = nonSteam ? apps()?.SetShortcutLaunchOptions : apps()?.SetAppLaunchOptions;
  if (!setter) return Promise.reject(new Error(`Steam ${nonSteam ? "shortcut " : ""}launch options API is unavailable`));
  return Promise.resolve(setter.call(apps(), appId, value));
}
function writeTarget(appId: number, value: string): Promise<void> {
  const setter = apps()?.SetShortcutExe;
  if (!setter) return Promise.reject(new Error("Steam shortcut Target API is unavailable"));
  return Promise.resolve(setter.call(apps(), appId, value));
}

export function updateSteamLaunchOptions(
  appId: number,
  nonSteam: boolean,
  transform: (options: string) => string,
): Promise<SteamLaunchOptionsSnapshot> {
  return queued(appId, nonSteam, async () => {
    const current = await readSteamLaunchOptions(appId, nonSteam);
    const next = transform(current.options);
    return next === current.options ? current : writeVerified(
      appId, nonSteam, current.options, next,
      (value) => writeOptions(appId, nonSteam, value), readOptions,
      "Steam did not accept the launch options",
    );
  });
}

export function installWrapperIntegration(
  appId: number,
  nonSteam: boolean,
  wrapperPath: string,
  commandTokenAdded = false,
  transport: TargetTransport = { kind: "host" },
  originalExecutable?: string,
): Promise<WrapperIntegrationResult> {
  return queued(appId, nonSteam, async () => {
    let current = await readSteamLaunchOptions(appId, nonSteam);
    if (usesShortcutTarget(nonSteam, transport)) {
      if (!current.target) throw new Error("Steam shortcut Target is empty; refusing to replace it");
      if (isWrapperToken(current.target, wrapperPath) && !managedFlatpakExecutable(current.target, wrapperPath)) {
        throw new Error("The shortcut Target points to a legacy frame-generation wrapper; restore it first");
      }
      const cleaned = cleanupPluginLaunchOptions(current.options, wrapperPath);
      const launchOptionsChanged = cleaned !== current.options;
      if (launchOptionsChanged) {
        current = await writeVerified(
          appId, true, current.options, cleaned,
          (value) => writeOptions(appId, true, value), readOptions,
          "Steam did not accept shortcut launch options",
        );
      }
      const savedOriginal = selectFlatpakExecutable(transport, originalExecutable);
      const managedOriginal = managedFlatpakExecutable(current.target, wrapperPath);
      if (managedOriginal) {
        if (savedOriginal && savedOriginal !== managedOriginal) {
          throw new Error("Shortcut Target changed externally; refusing to replace it");
        }
        return {
          snapshot: current,
          originalExecutable: savedOriginal || managedOriginal,
          commandTokenAdded: false,
          changed: launchOptionsChanged,
        };
      }
      const currentOriginal = selectFlatpakExecutable(transport, current.target);
      if (!currentOriginal || (savedOriginal && currentOriginal !== savedOriginal)) {
        throw new Error("Flatpak shortcut Target must be exactly /usr/bin/flatpak");
      }
      const value = await writeVerified(
        appId, true, current.target, flatpakTargetValue(wrapperPath, currentOriginal),
        (target) => writeTarget(appId, target), readTarget,
        "Steam did not accept the shortcut Target",
      );
      return { snapshot: value, originalExecutable: currentOriginal, commandTokenAdded: false, changed: true };
    }

    const cleaned = cleanupPluginAssignments(cleanupLegacyLaunchOptions(current.options));
    const alreadyInstalled = hasWrapperLaunchIntegration(current.options, wrapperPath);
    const rewrite = installLaunchOption(cleaned, wrapperPath, nonSteam);
    if (rewrite.options === current.options) return { snapshot: current, commandTokenAdded, changed: false };
    const value = await writeVerified(
      appId, nonSteam, current.options, rewrite.options,
      (options) => writeOptions(appId, nonSteam, options), readOptions,
      "Steam did not accept the launch options",
    );
    return { snapshot: value, commandTokenAdded: alreadyInstalled ? commandTokenAdded : rewrite.commandTokenAdded, changed: true };
  });
}

export function removeWrapperIntegration(
  appId: number,
  nonSteam: boolean,
  wrapperPath: string,
  originalExecutable?: string,
  commandTokenAdded = false,
  transport: TargetTransport = { kind: "host" },
): Promise<SteamLaunchOptionsSnapshot> {
  return queued(appId, nonSteam, async () => {
    let current = await readSteamLaunchOptions(appId, nonSteam);
    if (usesShortcutTarget(nonSteam, transport)) {
      const managedOriginal = managedFlatpakExecutable(current.target, wrapperPath);
      if (!managedOriginal && isWrapperToken(current.target, wrapperPath)) {
        throw new Error("Original shortcut Target is unavailable; refusing to overwrite the current Target");
      }
      const cleaned = cleanupPluginLaunchOptions(current.options, wrapperPath);
      if (cleaned !== current.options) {
        current = await writeVerified(
          appId, true, current.options, cleaned,
          (value) => writeOptions(appId, true, value), readOptions,
          "Steam did not clean shortcut launch options",
        );
      }
      if (!managedOriginal) {
        if (originalExecutable && selectFlatpakExecutable(transport, current.target) !== selectFlatpakExecutable(transport, originalExecutable)) {
          throw new Error("Shortcut Target changed externally; refusing to restore it");
        }
        return current;
      }
      const restoreTarget = selectFlatpakExecutable(transport, originalExecutable);
      if (originalExecutable && restoreTarget !== managedOriginal) {
        throw new Error("Shortcut Target changed externally; refusing to restore it");
      }
      return writeVerified(
        appId, true, current.target, restoreTarget || managedOriginal,
        (target) => writeTarget(appId, target), readTarget,
        "Steam did not restore the shortcut Target",
      );
    }
    const next = cleanupPluginAssignments(removeWrapperLaunchOption(current.options, wrapperPath, commandTokenAdded));
    return next === current.options ? current : writeVerified(
      appId, nonSteam, current.options, next,
      (options) => writeOptions(appId, nonSteam, options), readOptions,
      "Steam did not clean the launch options",
    );
  });
}

export const cleanupLegacySteamLaunchOptions = (
  appId: number,
  nonSteam: boolean,
  wrapperPath = DEFAULT_WRAPPER_PATH,
) => updateSteamLaunchOptions(appId, nonSteam, (options) => cleanupPluginLaunchOptions(options, wrapperPath));

export const getDefaultWrapperPath = () => DEFAULT_WRAPPER_PATH;
