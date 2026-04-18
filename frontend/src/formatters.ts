import i18n from "./i18n";

const localeByLanguage: Record<string, string> = {
  en: "en-US",
  de: "de-DE",
  ru: "ru-RU",
};

const getLocale = () => localeByLanguage[i18n.resolvedLanguage ?? "en"] ?? "en-US";

const parseDateInput = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const normalized =
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00`)
      : new Date(value);

  return Number.isNaN(normalized.getTime()) ? null : normalized;
};

export const formatDate = (value?: string | null) => {
  const parsed = parseDateInput(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat(getLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
};

export const formatDateTime = (value?: string | null) => {
  const parsed = parseDateInput(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat(getLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

export const formatRelativeTime = (value?: string | null) => {
  const parsed = parseDateInput(value);
  if (!parsed) return "-";

  const diffMs = parsed.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const formatter = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return formatter.format(diffDays, "day");
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return formatter.format(diffMonths, "month");
  }

  const diffYears = Math.round(diffMonths / 12);
  return formatter.format(diffYears, "year");
};

export const formatNumber = (value?: number | null) => {
  if (value == null) return "-";
  return new Intl.NumberFormat(getLocale()).format(value);
};

export const formatCurrency = (value?: number | null) => {
  if (value == null) return "-";
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatFileSize = (value?: number | null) => {
  if (value == null) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export const getCurrentDateInputValue = (date = new Date()) => {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
};
