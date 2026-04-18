import { TFunction } from "i18next";
import { ApiError } from "./api";

export const getErrorMessage = (error: unknown, t: TFunction) => {
  if (error instanceof ApiError) {
    if (error.code) {
      const key = `errors.codes.${error.code}`;
      const translated = t(key);
      if (translated !== key) {
        return translated;
      }
    }

    if (error.status === 401) {
      return t("errors.codes.UNAUTHORIZED");
    }

    if (error.status === 403) {
      return t("errors.codes.FORBIDDEN");
    }

    if (error.status === 400) {
      return t("errors.codes.VALIDATION_ERROR");
    }

    if (error.status >= 500) {
      return t("errors.codes.INTERNAL_SERVER_ERROR");
    }
  }

  if (error instanceof Error && error.message) {
    if (error.message === "Network error") {
      return t("errors.codes.NETWORK_ERROR");
    }

    if (error.message === "API request failed") {
      return t("errors.codes.INTERNAL_SERVER_ERROR");
    }

    return error.message;
  }

  return t("errors.codes.INTERNAL_SERVER_ERROR");
};
