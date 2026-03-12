// languages.json build via CI build
// to generate for localhost/dev, run `build_i18n_json.sh` script
import * as languages from "./languages.json";

function getLangs() {
  const langs = languages.language_metadata;

  Object.keys(languages).map((lang) => {
    if (lang === "language_metadata" || lang == "steam_language_map") {
      return;
    }
    const strs = languages[lang];
    if (lang && strs && langs[lang]?.name) {
      langs[lang].strings = strs;
    }
  });

  return langs;
}

export const LANGS: {
  [key: string]: {
    name: string;
    strings: {
      [key: string]: string;
    };
  };
} = getLangs();

let cachedLang: string | undefined;

export const getCurrentLanguage = (): string => {
  if (cachedLang) return cachedLang;

  const lang = window.LocalizationManager.m_rgLocalesToUse[0];
  cachedLang = lang;
  return lang;
};

export const getLanguageName = (lang?: string): string => {
  const targetLang = lang || getCurrentLanguage();
  return LANGS[targetLang]?.name || targetLang;
};

/**
 * Translate a key to the current language
 *
 * @param key - Translation key
 * @param originalString - Original text (fallback)
 * @returns Translated string or original text if translation not found
 *
 * @example
 * t('CONTENT_FPS_MULTIPLIER', 'FPS Multiplier')
 */
const t = (key: string, originalString: string): string => {
  const lang = getCurrentLanguage();

  // English always returns the original text
  if (lang === "en") return originalString;

  // Return translation if exists, otherwise return original text
  return LANGS[lang]?.strings?.[key] ?? originalString;
};

export default t;
