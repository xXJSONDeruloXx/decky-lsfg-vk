const DEFAULT_WRAPPER_PATH = "~/.lsfg";
const COMMAND_TOKEN = "%command%";

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
  "ENABLE_GAMESCOPE_WSI",
  "DISABLE_GAMESCOPE_WSI",
  "DXVK_HDR",
  "SteamDeck",
  "DISABLE_VKBASALT",
  "ENABLE_VKBASALT",
  "MESA_LOADER_DRIVER_OVERRIDE",
  "__GLX_VENDOR_LIBRARY_NAME",
  "GALLIUM_DRIVER",
  "DXVK_FRAME_RATE",
]);

const DXVK_FRAME_RATE_SEGMENT = /^(?:dxvk\.maxFrameRate|dxgi\.maxFrameRate|d3d9\.maxFrameRate)\s*=/i;

interface LaunchToken {
  raw: string;
  value: string;
}

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
}

function validateAppId(appId: number): void {
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new Error("Invalid Steam App ID");
}

function getSteamApps(): Partial<SteamApps> | undefined {
  return (globalThis as typeof globalThis & {
    SteamClient?: { Apps?: Partial<SteamApps> };
  }).SteamClient?.Apps;
}

interface TimerHost {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(timeout: number): void;
}

function timerHost(): TimerHost {
  if (typeof window !== "undefined") {
    return {
      setTimeout: (handler, timeout) => window.setTimeout(handler, timeout),
      clearTimeout: (timeout) => window.clearTimeout(timeout),
    };
  }
  return {
    setTimeout: (handler, timeout) => globalThis.setTimeout(handler, timeout) as unknown as number,
    clearTimeout: (timeout) => globalThis.clearTimeout(timeout),
  };
}

function snapshotFromDetails(appId: number, nonSteam: boolean, details: SteamAppDetails): SteamLaunchOptionsSnapshot {
  return {
    appId,
    nonSteam,
    options: nonSteam ? details.strShortcutLaunchOptions || "" : details.strLaunchOptions || "",
    target: nonSteam ? details.strShortcutExe || "" : "",
    details,
  };
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function registerSteamAppDetails(
  appId: number,
  onDetails: (details: SteamAppDetails) => boolean | void,
): () => void {
  validateAppId(appId);
  const apps = getSteamApps();
  const registerForAppDetails = apps?.RegisterForAppDetails;
  if (!registerForAppDetails) throw new Error("Steam app-details API is unavailable");

  let active = true;
  let unregisterPending = false;
  let registration: SteamAppDetailsRegistration | undefined;
  const unsubscribe = () => {
    active = false;
    if (!registration) {
      unregisterPending = true;
      return;
    }
    try {
      registration.unregister();
    } catch {
      // Steam can invalidate a registration while details are refreshing.
    }
  };

  try {
    registration = registerForAppDetails.call(apps, appId, (details) => {
      if (!active) return;
      if (onDetails(details || {}) === false && active) unsubscribe();
    });
    if (unregisterPending) {
      try {
        registration.unregister();
      } catch {
        // A synchronous callback can invalidate the registration before return.
      }
    }
  } catch (error) {
    throw asError(error);
  }
  return unsubscribe;
}

export async function readSteamLaunchOptions(appId: number, nonSteam: boolean): Promise<SteamLaunchOptionsSnapshot> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: number | undefined;
    let unsubscribe = () => {};
    const finish = (error?: unknown, details?: SteamAppDetails) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) timerHost().clearTimeout(timeout);
      unsubscribe();
      if (error) {
        reject(asError(error));
        return;
      }
      resolve(snapshotFromDetails(appId, nonSteam, details || {}));
    };

    timeout = timerHost().setTimeout(() => finish(new Error("Timed out reading Steam app details")), 5000);
    try {
      unsubscribe = registerSteamAppDetails(appId, (details) => {
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
  onSnapshot: (snapshot: SteamLaunchOptionsSnapshot) => void,
  onError: (error: Error) => void,
): () => void {
  return registerSteamAppDetails(appId, (details) => {
    try {
      onSnapshot(snapshotFromDetails(appId, nonSteam, details));
    } catch (error) {
      onError(asError(error));
    }
  });
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
    if (escaped) escaped = false;
    else if (character === "\\" && quote !== "'") escaped = true;
    else if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === "'" || character === '"') quote = character;
    else if (/\s/.test(character)) {
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
  return tokens.map((token) => token.raw).join(" ");
}

export function normalizeLaunchOptions(options: string): string {
  return serialize(tokenize(options));
}

function isCommandToken(token: LaunchToken): boolean {
  return token.raw.toLowerCase() === COMMAND_TOKEN;
}

function commandIndex(tokens: readonly LaunchToken[]): number {
  return tokens.findIndex(isCommandToken);
}

function isAssignment(token: LaunchToken): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token.value);
}

function isLegacyToken(value: string): boolean {
  return LEGACY_WRAPPER_TOKENS.has(value) || LEGACY_ABSOLUTE_WRAPPER.test(value);
}

export function isLegacyWrapperToken(value: string): boolean {
  return isLegacyToken(decodeToken(value));
}

function isWrapperToken(value: string, wrapperPath: string): boolean {
  return decodeToken(value) === wrapperPath || isLegacyWrapperToken(value);
}

function removeWrapperTokens(tokens: LaunchToken[], wrapperPath: string): boolean {
  const index = commandIndex(tokens);
  const prefixEnd = index >= 0 ? index : tokens.length;
  const retained = tokens.filter((token, tokenIndex) => tokenIndex >= prefixEnd || !isWrapperToken(token.value, wrapperPath));
  if (retained.length === tokens.length) return false;
  tokens.splice(0, tokens.length, ...retained);
  return true;
}

function removeLegacyTokens(tokens: LaunchToken[]): boolean {
  const index = commandIndex(tokens);
  const prefixEnd = index >= 0 ? index : tokens.length;
  const retained = tokens.filter((token, tokenIndex) => tokenIndex >= prefixEnd || !isLegacyToken(token.value));
  if (retained.length === tokens.length) return false;
  tokens.splice(0, tokens.length, ...retained);
  return true;
}

function leadingAssignments(tokens: readonly LaunchToken[]): number {
  let count = 0;
  while (count < tokens.length && isAssignment(tokens[count])) count += 1;
  return count;
}

function wrapperToken(wrapperPath: string): LaunchToken {
  return { raw: wrapperPath, value: wrapperPath };
}

export interface LaunchOptionRewrite {
  options: string;
  commandTokenAdded: boolean;
}

/** Add one exact wrapper token immediately before Steam's command macro. */
export function installWrapperLaunchOption(options: string, wrapperPath = DEFAULT_WRAPPER_PATH): LaunchOptionRewrite {
  const tokens = tokenize(options);
  removeLegacyTokens(tokens);
  let index = commandIndex(tokens);
  if (index >= 0) {
    const currentWrapper = tokens[index - 1];
    if (currentWrapper && currentWrapper.value === wrapperPath) {
      return { options: serialize(tokens), commandTokenAdded: false };
    }
    const retained = tokens.filter((token, tokenIndex) => tokenIndex >= index || token.value !== wrapperPath);
    tokens.splice(0, tokens.length, ...retained);
    index = commandIndex(tokens);
    tokens.splice(index, 0, wrapperToken(wrapperPath));
    return { options: serialize(tokens), commandTokenAdded: false };
  }

  const insertion = leadingAssignments(tokens);
  const argumentsOnly = insertion === tokens.length || tokens[insertion]?.value.startsWith("-");
  if (tokens.length !== insertion && !argumentsOnly) {
    throw new Error("Launch options do not contain %command%; refusing to guess a launcher command");
  }
  tokens.splice(insertion, 0, wrapperToken(wrapperPath), { raw: COMMAND_TOKEN, value: COMMAND_TOKEN });
  return { options: serialize(tokens), commandTokenAdded: true };
}

/** Remove the wrapper and known legacy tokens, preserving the user's arguments. */
export function removeWrapperLaunchOption(
  options: string,
  wrapperPath = DEFAULT_WRAPPER_PATH,
  commandTokenAdded = false,
): string {
  const tokens = tokenize(options);
  const removed = removeWrapperTokens(tokens, wrapperPath);
  if (removed && commandTokenAdded) {
    const index = commandIndex(tokens);
    if (index >= 0) tokens.splice(index, 1);
  }
  return serialize(tokens);
}

function encodeAssignmentValue(value: string): string {
  if (/^[A-Za-z0-9_./:+,%=-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function cleanDxvkConfigValue(value: string): string | null {
  const retained = value
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment && !DXVK_FRAME_RATE_SEGMENT.test(segment));
  return retained.length > 0 ? retained.join("; ") : null;
}

/** Remove only the old plugin's direct assignments; unrelated prefixes remain. */
export function cleanupPluginAssignments(options: string): string {
  const tokens = tokenize(options);
  const index = commandIndex(tokens);
  const prefixEnd = index >= 0 ? index : tokens.length;
  const retained: LaunchToken[] = [];
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (tokenIndex >= prefixEnd || !isAssignment(token)) {
      retained.push(token);
      continue;
    }
    const separator = token.value.indexOf("=");
    const key = token.value.slice(0, separator);
    if (key === "DXVK_CONFIG") {
      const cleaned = cleanDxvkConfigValue(token.value.slice(separator + 1));
      if (cleaned) retained.push({ raw: `DXVK_CONFIG=${encodeAssignmentValue(cleaned)}`, value: `DXVK_CONFIG=${cleaned}` });
      continue;
    }
    if (!MANAGED_ENV_KEYS.has(key)) retained.push(token);
  }
  return serialize(retained);
}

export function cleanupLegacyLaunchOptions(options: string): string {
  const tokens = tokenize(options);
  removeLegacyTokens(tokens);
  return serialize(tokens);
}

export function cleanupPluginLaunchOptions(options: string, wrapperPath = DEFAULT_WRAPPER_PATH): string {
  const tokens = tokenize(options);
  removeWrapperTokens(tokens, wrapperPath);
  return cleanupPluginAssignments(serialize(tokens));
}

export function cleanupLegacyWrapper(options: string, wrapperPath = DEFAULT_WRAPPER_PATH): string {
  return cleanupPluginLaunchOptions(options, wrapperPath);
}

export function hasWrapperLaunchIntegration(options: string, wrapperPath = DEFAULT_WRAPPER_PATH): boolean {
  const tokens = tokenize(options);
  const index = commandIndex(tokens);
  return index > 0 && tokens[index - 1].value === wrapperPath;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => timerHost().setTimeout(resolve, milliseconds));
}

async function setSteamLaunchOptions(appId: number, nonSteam: boolean, options: string): Promise<void> {
  const apps = getSteamApps();
  const setter = nonSteam ? apps?.SetShortcutLaunchOptions : apps?.SetAppLaunchOptions;
  if (!setter) throw new Error(`Steam ${nonSteam ? "shortcut " : ""}launch options API is unavailable`);
  await Promise.resolve(setter.call(apps, appId, options));
}

async function setShortcutExecutable(appId: number, executable: string): Promise<void> {
  const apps = getSteamApps();
  if (!apps?.SetShortcutExe) throw new Error("Steam shortcut Target API is unavailable");
  await Promise.resolve(apps.SetShortcutExe.call(apps, appId, executable));
}

async function waitForSnapshot(
  appId: number,
  nonSteam: boolean,
  matches: (snapshot: SteamLaunchOptionsSnapshot) => boolean,
  message: string,
): Promise<SteamLaunchOptionsSnapshot> {
  const deadline = Date.now() + 5000;
  let lastError: Error | null = null;
  while (Date.now() <= deadline) {
    try {
      const snapshot = await readSteamLaunchOptions(appId, nonSteam);
      if (matches(snapshot)) return snapshot;
    } catch (error) {
      lastError = asError(error);
    }
    if (Date.now() >= deadline) break;
    await delay(100);
  }
  if (lastError) throw new Error(`${message}: ${lastError.message}`);
  throw new Error(`${message} before the readback timeout`);
}

async function writeLaunchOptionsAndVerify(
  appId: number,
  nonSteam: boolean,
  previous: string,
  next: string,
  message: string,
): Promise<SteamLaunchOptionsSnapshot> {
  try {
    await setSteamLaunchOptions(appId, nonSteam, next);
    return await waitForSnapshot(
      appId,
      nonSteam,
      (snapshot) => normalizeLaunchOptions(snapshot.options) === normalizeLaunchOptions(next),
      message,
    );
  } catch (error) {
    const failure = asError(error);
    try {
      await setSteamLaunchOptions(appId, nonSteam, previous);
      await waitForSnapshot(
        appId,
        nonSteam,
        (snapshot) => normalizeLaunchOptions(snapshot.options) === normalizeLaunchOptions(previous),
        "Steam did not restore the previous launch options",
      );
    } catch (rollbackError) {
      throw new Error(`${failure.message}; rollback also failed: ${asError(rollbackError).message}`);
    }
    throw failure;
  }
}

async function writeShortcutExecutableAndVerify(
  appId: number,
  previous: string,
  next: string,
  message: string,
): Promise<SteamLaunchOptionsSnapshot> {
  try {
    await setShortcutExecutable(appId, next);
    return await waitForSnapshot(appId, true, (snapshot) => snapshot.target === next, message);
  } catch (error) {
    const failure = asError(error);
    try {
      await setShortcutExecutable(appId, previous);
      await waitForSnapshot(appId, true, (snapshot) => snapshot.target === previous, "Steam did not restore the previous shortcut Target");
    } catch (rollbackError) {
      throw new Error(`${failure.message}; rollback also failed: ${asError(rollbackError).message}`);
    }
    throw failure;
  }
}

const operationQueues = new Map<string, Promise<unknown>>();

function queueSteamOperation<T>(appId: number, nonSteam: boolean, operation: () => Promise<T>): Promise<T> {
  const key = `${nonSteam ? "shortcut" : "app"}:${appId}`;
  const previous = operationQueues.get(key) || Promise.resolve();
  const queued = previous.catch(() => undefined).then(operation);
  const cleanup = queued.then(
    () => { if (operationQueues.get(key) === cleanup) operationQueues.delete(key); },
    () => { if (operationQueues.get(key) === cleanup) operationQueues.delete(key); },
  );
  operationQueues.set(key, cleanup);
  return queued;
}

export function updateSteamLaunchOptions(
  appId: number,
  nonSteam: boolean,
  transform: (options: string) => string,
): Promise<SteamLaunchOptionsSnapshot> {
  return queueSteamOperation(appId, nonSteam, async () => {
    const current = await readSteamLaunchOptions(appId, nonSteam);
    const next = transform(current.options);
    if (next === current.options) return current;
    return writeLaunchOptionsAndVerify(appId, nonSteam, current.options, next, "Steam did not accept the launch options");
  });
}

export function installWrapperIntegration(
  appId: number,
  nonSteam: boolean,
  wrapperPath: string,
  commandTokenAdded = false,
): Promise<WrapperIntegrationResult> {
  return queueSteamOperation(appId, nonSteam, async () => {
    const current = await readSteamLaunchOptions(appId, nonSteam);
    if (nonSteam) {
      if (!current.target) throw new Error("Steam shortcut Target is empty; refusing to replace it");
      if (current.target !== wrapperPath && isWrapperToken(current.target, wrapperPath)) {
        throw new Error("The shortcut Target points to a legacy frame-generation wrapper; restore it first");
      }
      const cleanedOptions = cleanupPluginLaunchOptions(current.options, wrapperPath);
      if (cleanedOptions !== current.options) {
        await writeLaunchOptionsAndVerify(appId, true, current.options, cleanedOptions, "Steam did not accept shortcut launch options");
      }
      if (current.target === wrapperPath) {
        return { snapshot: await readSteamLaunchOptions(appId, true), originalExecutable: undefined, commandTokenAdded: false };
      }
      const originalExecutable = current.target;
      const snapshot = await writeShortcutExecutableAndVerify(appId, originalExecutable, wrapperPath, "Steam did not accept the shortcut Target");
      return { snapshot, originalExecutable, commandTokenAdded: false };
    }

    const cleaned = cleanupPluginAssignments(cleanupLegacyLaunchOptions(current.options));
    const alreadyInstalled = hasWrapperLaunchIntegration(current.options, wrapperPath);
    const rewrite = installWrapperLaunchOption(cleaned, wrapperPath);
    if (rewrite.options === current.options) {
      return { snapshot: current, commandTokenAdded };
    }
    const snapshot = await writeLaunchOptionsAndVerify(appId, false, current.options, rewrite.options, "Steam did not accept the launch options");
    return { snapshot, commandTokenAdded: alreadyInstalled ? commandTokenAdded : rewrite.commandTokenAdded };
  });
}

export function removeWrapperIntegration(
  appId: number,
  nonSteam: boolean,
  wrapperPath: string,
  originalExecutable?: string,
  commandTokenAdded = false,
): Promise<SteamLaunchOptionsSnapshot> {
  return queueSteamOperation(appId, nonSteam, async () => {
    const current = await readSteamLaunchOptions(appId, nonSteam);
    if (nonSteam) {
      if (!originalExecutable || isWrapperToken(originalExecutable, wrapperPath)) {
        throw new Error("Original shortcut Target is unavailable; refusing to overwrite the current Target");
      }
      if (current.target !== wrapperPath && current.target !== originalExecutable) {
        throw new Error("Shortcut Target changed externally; refusing to restore it");
      }
      const cleaned = cleanupPluginLaunchOptions(current.options, wrapperPath);
      if (cleaned !== current.options) {
        await writeLaunchOptionsAndVerify(appId, true, current.options, cleaned, "Steam did not clean shortcut launch options");
      }
      if (current.target === originalExecutable) {
        return readSteamLaunchOptions(appId, true);
      }
      return writeShortcutExecutableAndVerify(appId, wrapperPath, originalExecutable, "Steam did not restore the shortcut Target");
    }

    const withoutWrapper = removeWrapperLaunchOption(current.options, wrapperPath, commandTokenAdded);
    const next = cleanupPluginAssignments(withoutWrapper);
    if (next === current.options) return current;
    return writeLaunchOptionsAndVerify(appId, false, current.options, next, "Steam did not clean the launch options");
  });
}

export function cleanupLegacySteamLaunchOptions(
  appId: number,
  nonSteam: boolean,
  wrapperPath = DEFAULT_WRAPPER_PATH,
): Promise<SteamLaunchOptionsSnapshot> {
  return queueSteamOperation(appId, nonSteam, async () => {
    const current = await readSteamLaunchOptions(appId, nonSteam);
    const next = cleanupPluginLaunchOptions(current.options, wrapperPath);
    if (next === current.options) return current;
    return writeLaunchOptionsAndVerify(appId, nonSteam, current.options, next, "Steam did not clean legacy launch options");
  });
}

export function getDefaultWrapperPath(): string {
  return DEFAULT_WRAPPER_PATH;
}
