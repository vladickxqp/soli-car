import { TFunction } from "i18next";
import { formatCurrency, formatDate, formatNumber } from "../formatters";
import {
  VehicleDamageStatus,
  VehicleHistory,
  VehicleIncidentStatus,
  VehicleStatus,
} from "../types";

const IGNORED_KEYS = new Set(["createdAt", "updatedAt", "deletedAt", "archivedByUserId"]);
const CURRENCY_KEYS = new Set([
  "price",
  "contractValue",
  "leasingRate",
  "insuranceCost",
  "taxPerYear",
]);
const NUMBER_KEYS = new Set(["mileage", "yearlyMileage"]);
const PERCENT_KEYS = new Set(["interest"]);
const STATUS_VALUES = new Set<VehicleStatus>([
  "ACTIVE",
  "IN_SERVICE",
  "UNDER_REPAIR",
  "TRANSFER_PENDING",
  "ARCHIVED",
  "INACTIVE",
  "DISPOSED",
  "DAMAGED",
  "IN_LEASING",
  "SOLD",
  "MAINTENANCE",
  "TRANSFERRED",
]);
const DAMAGE_STATUS_VALUES = new Set<VehicleDamageStatus>([
  "NONE",
  "REPORTED",
  "UNDER_REPAIR",
  "REPAIRED",
]);
const INCIDENT_STATUS_VALUES = new Set<VehicleIncidentStatus>([
  "UNRESOLVED",
  "REPAIRED",
]);
const SPECIAL_ENTITY_KEYS = new Set(["incident", "document", "maintenance"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isDateString = (value: string) => !Number.isNaN(Date.parse(value)) && value.includes("-");

const getFieldLabel = (key: string, t: TFunction) => {
  if (SPECIAL_ENTITY_KEYS.has(key)) {
    const translatedSpecial = t(`history.labels.${key}`);
    return translatedSpecial === `history.labels.${key}` ? key : translatedSpecial;
  }

  const translated = t(`vehicle.${key}`);
  return translated === `vehicle.${key}` ? key : translated;
};

const formatDocumentType = (value: string, t: TFunction) => {
  const translated = t(`vehicleDetails.documents.types.${value}`);
  return translated === `vehicleDetails.documents.types.${value}` ? value : translated;
};

const formatMaintenanceStatus = (value: string, t: TFunction) => {
  const translated = t(`vehicleDetails.maintenance.status.${value}`);
  return translated === `vehicleDetails.maintenance.status.${value}` ? value : translated;
};

const formatEntityRecord = (key: string, value: Record<string, unknown>, t: TFunction) => {
  if (key === "incident") {
    const parts = [
      typeof value.title === "string" ? value.title : null,
      typeof value.status === "string" && INCIDENT_STATUS_VALUES.has(value.status as VehicleIncidentStatus)
        ? t(`incidentStatus.${value.status}`)
        : null,
      typeof value.occurredAt === "string" && isDateString(value.occurredAt) ? formatDate(value.occurredAt) : null,
    ].filter(Boolean);

    return parts.join(" / ") || JSON.stringify(value);
  }

  if (key === "document") {
    const parts = [
      typeof value.title === "string" ? value.title : null,
      typeof value.documentType === "string" ? formatDocumentType(value.documentType, t) : null,
      typeof value.originalName === "string" ? value.originalName : null,
      typeof value.sizeBytes === "number" ? formatNumber(value.sizeBytes) : null,
    ].filter(Boolean);

    return parts.join(" / ") || JSON.stringify(value);
  }

  if (key === "maintenance") {
    const parts = [
      typeof value.title === "string" ? value.title : null,
      typeof value.status === "string" ? formatMaintenanceStatus(value.status, t) : null,
      typeof value.serviceDate === "string" && isDateString(value.serviceDate) ? formatDate(value.serviceDate) : null,
      typeof value.cost === "number" ? formatCurrency(value.cost) : null,
    ].filter(Boolean);

    return parts.join(" / ") || JSON.stringify(value);
  }

  return JSON.stringify(value);
};

const formatScalar = (key: string, value: unknown, t: TFunction) => {
  if (value == null || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    if (CURRENCY_KEYS.has(key)) {
      return formatCurrency(value);
    }

    if (PERCENT_KEYS.has(key)) {
      return `${formatNumber(value)}%`;
    }

    return NUMBER_KEYS.has(key)
      ? t("units.kilometers", { value: formatNumber(value) })
      : formatNumber(value);
  }

  if (typeof value === "boolean") {
    return value ? t("common.yes") : t("common.no");
  }

  if (typeof value === "string") {
    if (STATUS_VALUES.has(value as VehicleStatus)) {
      return t(`status.${value}`);
    }

    if (DAMAGE_STATUS_VALUES.has(value as VehicleDamageStatus)) {
      return t(`damageStatus.${value}`);
    }

    if (INCIDENT_STATUS_VALUES.has(value as VehicleIncidentStatus)) {
      return t(`incidentStatus.${value}`);
    }

    if (isDateString(value)) {
      return formatDate(value);
    }

    return value;
  }

  return JSON.stringify(value);
};

const formatIncidentArray = (value: unknown, t: TFunction) => {
  if (!Array.isArray(value) || value.length === 0) {
    return "-";
  }

  return value
    .map((incident) => {
      if (!isRecord(incident)) {
        return JSON.stringify(incident);
      }

      const title = typeof incident.title === "string" ? incident.title : t("vehicle.incidentRecord");
      const status =
        typeof incident.status === "string" && INCIDENT_STATUS_VALUES.has(incident.status as VehicleIncidentStatus)
          ? t(`incidentStatus.${incident.status}`)
          : "";
      return [title, status].filter(Boolean).join(" / ");
    })
    .join(", ");
};

export interface HistoryChangeRow {
  key: string;
  label: string;
  previous: string;
  current: string;
}

export const getHistoryChangeRows = (entry: VehicleHistory, t: TFunction): HistoryChangeRow[] => {
  const oldData = isRecord(entry.oldData) ? entry.oldData : {};
  const newData = isRecord(entry.newData) ? entry.newData : {};

  const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]))
    .filter((key) => !IGNORED_KEYS.has(key))
    .filter((key) => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]));

  return keys.slice(0, 14).map((key) => ({
    key,
    label: getFieldLabel(key, t),
    previous:
      key === "incidents"
        ? formatIncidentArray(oldData[key], t)
        : isRecord(oldData[key]) && SPECIAL_ENTITY_KEYS.has(key)
          ? formatEntityRecord(key, oldData[key] as Record<string, unknown>, t)
          : formatScalar(key, oldData[key], t),
    current:
      key === "incidents"
        ? formatIncidentArray(newData[key], t)
        : isRecord(newData[key]) && SPECIAL_ENTITY_KEYS.has(key)
          ? formatEntityRecord(key, newData[key] as Record<string, unknown>, t)
          : formatScalar(key, newData[key], t),
  }));
};

export const getHistoryEntrySummary = (entry: VehicleHistory, t: TFunction) => {
  const rows = getHistoryChangeRows(entry, t);

  if (rows.length === 0) {
    return t("history.noFieldDiff");
  }

  return rows.map((row) => `${row.label}: ${row.previous} -> ${row.current}`);
};
