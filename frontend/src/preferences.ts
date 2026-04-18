export const LANGUAGE_STORAGE_KEY = "soli-car-language";
export const THEME_STORAGE_KEY = "soli-car-theme";
export const VEHICLE_VIEW_STORAGE_KEY = "soli-car-vehicle-view";

export type ThemePreference = "light" | "dark";
export type VehicleViewPreference = "table" | "cards";

const canUseDom = () => typeof window !== "undefined" && typeof document !== "undefined";

const readStorage = (key: string) => {
  if (!canUseDom()) {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  if (!canUseDom()) {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures to keep the UI functional in restricted contexts.
  }
};

export const getStoredThemePreference = (): ThemePreference => {
  return readStorage(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
};

export const applyThemePreference = (theme: ThemePreference) => {
  if (!canUseDom()) {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new CustomEvent("soli-car-theme-change", { detail: theme }));
};

export const setStoredThemePreference = (theme: ThemePreference) => {
  writeStorage(THEME_STORAGE_KEY, theme);
  applyThemePreference(theme);
};

export const initializeThemePreference = () => {
  const theme = getStoredThemePreference();
  writeStorage(THEME_STORAGE_KEY, theme);
  applyThemePreference(theme);
};

export const getStoredVehicleViewPreference = (): VehicleViewPreference =>
  readStorage(VEHICLE_VIEW_STORAGE_KEY) === "cards" ? "cards" : "table";

export const setStoredVehicleViewPreference = (value: VehicleViewPreference) => {
  writeStorage(VEHICLE_VIEW_STORAGE_KEY, value);
};
