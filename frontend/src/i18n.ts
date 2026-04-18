import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import de from './locales/de.json';
import ru from './locales/ru.json';
import { LANGUAGE_STORAGE_KEY } from './preferences';

const resources = {
  en: { translation: en },
  de: { translation: de },
  ru: { translation: ru },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: ['en', 'de', 'ru'],
    fallbackLng: 'en',
    debug: false,
    lng: localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? undefined,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
  });

export default i18n;
