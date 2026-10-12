import * as languages from "./languages.json";
import { getSteamLanguage } from "../api/lsfgApi";

type LanguageStrings = Record<string, string>;
type Language = { name: string; strings?: LanguageStrings };
type LanguageData = {
  language_metadata: Record<string, Language>;
  steam_language_map: Record<string, string>;
  [language: string]: LanguageStrings | Record<string, Language> | Record<string, string>;
};

const languageData = languages as unknown as LanguageData;
const steamLanguageMap = languageData.steam_language_map;

const normalizeLanguage = (language: string): string => {
  if (!language || typeof language !== "string") return "en";
  const normalized = language.trim().toLowerCase();
  return steamLanguageMap[normalized] ?? normalized;
};

function getLangs() {
  const langs = languageData.language_metadata;

  Object.keys(languageData).forEach((lang) => {
    if (lang === "language_metadata" || lang === "steam_language_map") {
      return;
    }
    const strs = languageData[lang] as LanguageStrings;
    if (lang && strs && langs[lang]?.name) {
      langs[lang].strings = strs;
    }
  });

  return langs;
}

export const LANGS: {
  [key: string]: Language;
} = getLangs();

let cachedLang: string | null = null;

export const setCachedLanguage = (lang: string) => {
  cachedLang = lang;
  try {
    window?.localStorage?.setItem("decky_plugin_steam_language", lang);
  } catch {}
};

export const initLanguage = async () => {
  try {
    const rawLang = await getSteamLanguage();
    if (rawLang) {
      const norm = normalizeLanguage(rawLang);
      if (LANGS[norm]?.strings) {
        setCachedLanguage(norm);
      }
    }
  } catch (e) {
    console.warn("Failed to get steam language from python:", e);
  }
};

// Initiate background fetch
try {
  void initLanguage();
} catch {}

export const getCurrentLanguage = (): string => {
  if (cachedLang && LANGS[cachedLang]?.strings) {
    return cachedLang;
  }

  try {
    const win = window as any;

    // 0. Check localStorage cached language
    const stored = win?.localStorage?.getItem("decky_plugin_steam_language");
    if (stored && LANGS[stored]?.strings) {
      cachedLang = stored;
      return stored;
    }

    // Check windows: win, top, parent, opener
    for (const w of [win, win?.top, win?.parent, win?.opener]) {
      if (!w) continue;

      // 1. Primary Steam Big Picture locales list
      const locales = w?.LocalizationManager?.m_rgLocalesToUse;
      if (Array.isArray(locales) && locales.length > 0) {
        for (const loc of locales) {
          if (typeof loc === "string") {
            const norm = normalizeLanguage(loc);
            if (LANGS[norm]?.strings) {
              setCachedLanguage(norm);
              return norm;
            }
          }
        }
      }

      // 2. Steam Big Picture current language string
      const currentSteamLang = w?.LocalizationManager?.m_strCurrentLanguage;
      if (typeof currentSteamLang === "string") {
        const norm = normalizeLanguage(currentSteamLang);
        if (LANGS[norm]?.strings) {
          setCachedLanguage(norm);
          return norm;
        }
      }

      // 3. SteamClient Settings API if available
      if (typeof w?.SteamClient?.Settings?.GetCurrentLanguage === "function") {
        const clientLang = w.SteamClient.Settings.GetCurrentLanguage();
        if (typeof clientLang === "string") {
          const norm = normalizeLanguage(clientLang);
          if (LANGS[norm]?.strings) {
            setCachedLanguage(norm);
            return norm;
          }
        }
      }
    }

    // 4. Browser / CEF fallback
    if (Array.isArray(navigator.languages)) {
      for (const loc of navigator.languages) {
        if (typeof loc === "string") {
          const norm = normalizeLanguage(loc);
          if (LANGS[norm]?.strings) return norm;
        }
      }
    }

    if (typeof navigator.language === "string") {
      const norm = normalizeLanguage(navigator.language);
      if (LANGS[norm]?.strings) return norm;
    }
  } catch (err) {
    console.warn("Error detecting current Steam language:", err);
  }

  return "en";
};

export const getLanguageName = (lang?: string): string => {
  const targetLang = normalizeLanguage(lang || getCurrentLanguage());
  return LANGS[targetLang]?.name || targetLang;
};

/**
 * Translate a key to the current language
 *
 * @param key - Translation key
 * @param originalString - Original text (fallback)
 * @param params - Optional parameter map for placeholder replacement {key}
 * @returns Translated string or original text if translation not found
 *
 * @example
 * t('CONTENT_FPS_MULTIPLIER', 'FPS Multiplier')
 * t('MULTIPLIER_LABEL', 'FPS multiplier · {multiplier}', { multiplier: '2x' })
 */
export const t = (
  key: string,
  originalString: string,
  params?: Record<string, string | number>
): string => {
  const lang = getCurrentLanguage();

  let text = originalString;
  if (lang !== "en") {
    text = LANGS[lang]?.strings?.[key] ?? originalString;
  }

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }

  return text;
};

export default t;
