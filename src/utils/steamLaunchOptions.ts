// @ts-expect-error Node's built-in TypeScript loader requires explicit source extensions in tests.
import { cleanupLegacyWrapper, isLegacyWrapperToken, normalizeLaunchOptions } from "./steamLaunchOptionParser.ts";

// @ts-expect-error Node's built-in TypeScript loader requires explicit source extensions in tests.
export * from "./steamLaunchOptionParser.ts";

export interface SteamLaunchOptionsSnapshot {
  appId: number;
  nonSteam: boolean;
  options: string;
  details: SteamAppDetails;
}

function validateAppId(appId: number): void {
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new Error("Invalid Steam App ID");
}

function getSteamApps(): Partial<SteamApps> | undefined {
  return (globalThis as typeof globalThis & {
    SteamClient?: { Apps?: Partial<SteamApps> };
  }).SteamClient?.Apps;
}

function snapshotFromDetails(appId: number, nonSteam: boolean, details: SteamAppDetails): SteamLaunchOptionsSnapshot {
  if (nonSteam && isLegacyWrapperToken(details.strShortcutExe || "")) {
    throw new Error("The shortcut Target still points to the legacy ~/lsfg wrapper; restore its original executable first");
  }
  return {
    appId,
    nonSteam,
    options: nonSteam ? details.strShortcutLaunchOptions || "" : details.strLaunchOptions || "",
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
  if (!registerForAppDetails) throw new Error("Steam launch options API is unavailable");

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
      // Steam may invalidate registrations during a details refresh.
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
        // The registration can be invalidated before a synchronous callback returns.
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
    let timeout = 0;
    let unsubscribe = () => {};
    const finish = (error?: unknown, details?: SteamAppDetails) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      unsubscribe();
      if (error) {
        reject(asError(error));
        return;
      }
      try {
        resolve(snapshotFromDetails(appId, nonSteam, details || {}));
      } catch (snapshotError) {
        reject(asError(snapshotError));
      }
    };

    timeout = window.setTimeout(() => finish(new Error("Timed out reading Steam launch options")), 5000);
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

async function setSteamLaunchOptions(appId: number, nonSteam: boolean, options: string): Promise<void> {
  const apps = getSteamApps();
  const setter = nonSteam ? apps?.SetShortcutLaunchOptions : apps?.SetAppLaunchOptions;
  if (!setter) throw new Error(`Steam ${nonSteam ? "shortcut " : ""}launch options API is unavailable`);
  await Promise.resolve(setter.call(apps, appId, options));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForLaunchOptions(
  appId: number,
  nonSteam: boolean,
  expected: string,
): Promise<SteamLaunchOptionsSnapshot> {
  const deadline = Date.now() + 5000;
  let lastError: Error | null = null;
  while (Date.now() <= deadline) {
    try {
      const snapshot = await readSteamLaunchOptions(appId, nonSteam);
      if (normalizeLaunchOptions(snapshot.options) === normalizeLaunchOptions(expected)) return snapshot;
    } catch (error) {
      lastError = asError(error);
    }
    if (Date.now() >= deadline) break;
    await delay(100);
  }
  if (lastError) throw new Error(`Steam did not accept the launch options: ${lastError.message}`);
  throw new Error("Steam did not accept the launch options before the readback timeout");
}

const operationQueues = new Map<string, Promise<void>>();

function queueKey(appId: number, nonSteam: boolean): string {
  return `${nonSteam ? "shortcut" : "app"}:${appId}`;
}

function queueSteamAppOperation<T>(appId: number, nonSteam: boolean, operation: () => Promise<T>): Promise<T> {
  const key = queueKey(appId, nonSteam);
  const previous = operationQueues.get(key) || Promise.resolve();
  const queued = previous.catch(() => undefined).then(operation);
  let cleanup: Promise<void>;
  cleanup = queued.then(
    () => {
      if (operationQueues.get(key) === cleanup) operationQueues.delete(key);
    },
    () => {
      if (operationQueues.get(key) === cleanup) operationQueues.delete(key);
    },
  );
  operationQueues.set(key, cleanup);
  return queued;
}

export function updateSteamLaunchOptions(
  appId: number,
  nonSteam: boolean,
  transform: (options: string) => string,
): Promise<SteamLaunchOptionsSnapshot> {
  return queueSteamAppOperation(appId, nonSteam, async () => {
    const current = await readSteamLaunchOptions(appId, nonSteam);
    const next = transform(current.options);
    if (next === current.options) return current;
    await setSteamLaunchOptions(appId, nonSteam, next);
    return waitForLaunchOptions(appId, nonSteam, next);
  });
}

export function cleanupSteamLaunchOptions(
  appId: number,
  nonSteam: boolean,
): Promise<SteamLaunchOptionsSnapshot> {
  return queueSteamAppOperation(appId, nonSteam, async () => {
    const current = await readSteamLaunchOptions(appId, nonSteam);
    const next = cleanupLegacyWrapper(current.options);
    if (next === current.options) return current;
    await setSteamLaunchOptions(appId, nonSteam, next);
    return waitForLaunchOptions(appId, nonSteam, next);
  });
}
