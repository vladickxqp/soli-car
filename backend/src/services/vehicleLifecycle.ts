import { Prisma, VehicleStatus } from "@prisma/client";
import { createAppError } from "../utils/httpError.js";

export type ArchivedView = "active" | "archived" | "all";

const ACTIVE_TRANSITIONS: Record<VehicleStatus, VehicleStatus[]> = {
  ACTIVE: ["IN_SERVICE", "UNDER_REPAIR", "TRANSFER_PENDING", "INACTIVE", "DAMAGED", "SOLD", "IN_LEASING", "MAINTENANCE", "ARCHIVED"],
  IN_SERVICE: ["ACTIVE", "UNDER_REPAIR", "INACTIVE", "ARCHIVED", "DAMAGED", "MAINTENANCE"],
  UNDER_REPAIR: ["ACTIVE", "DAMAGED", "ARCHIVED", "IN_SERVICE"],
  TRANSFER_PENDING: ["ACTIVE", "TRANSFERRED", "ARCHIVED"],
  ARCHIVED: ["ACTIVE", "INACTIVE", "SOLD", "IN_LEASING", "DAMAGED", "UNDER_REPAIR"],
  INACTIVE: ["ACTIVE", "ARCHIVED", "SOLD", "IN_SERVICE"],
  DISPOSED: ["ARCHIVED"],
  DAMAGED: ["UNDER_REPAIR", "ACTIVE", "ARCHIVED", "IN_SERVICE"],
  IN_LEASING: ["ACTIVE", "IN_SERVICE", "UNDER_REPAIR", "INACTIVE", "DAMAGED", "SOLD", "ARCHIVED"],
  SOLD: ["ARCHIVED", "DISPOSED"],
  MAINTENANCE: ["ACTIVE", "IN_SERVICE", "UNDER_REPAIR", "ARCHIVED"],
  TRANSFERRED: ["ACTIVE", "ARCHIVED"],
};

export const isArchivedVehicle = (vehicle: {
  status?: VehicleStatus | null;
  archivedAt?: Date | null;
  deletedAt?: Date | null;
}) => Boolean(vehicle.archivedAt || vehicle.deletedAt || vehicle.status === "ARCHIVED");

export const resolveArchivedView = (value?: string | null): ArchivedView => {
  if (value === "archived" || value === "all") {
    return value;
  }

  return "active";
};

export const buildArchivedVehicleWhere = (archivedView: ArchivedView): Prisma.VehicleWhereInput => {
  if (archivedView === "archived") {
    return {
      OR: [
        { archivedAt: { not: null } },
        { deletedAt: { not: null } },
        { status: "ARCHIVED" },
      ],
    };
  }

  if (archivedView === "all") {
    return {};
  }

  return {
    archivedAt: null,
    deletedAt: null,
    status: {
      not: "ARCHIVED",
    },
  };
};

export const assertVehicleStatusTransition = (
  currentStatus: VehicleStatus,
  nextStatus: VehicleStatus,
  options?: { canArchive?: boolean },
) => {
  if (currentStatus === nextStatus) {
    return;
  }

  if (nextStatus === "ARCHIVED" && options?.canArchive === false) {
    throw createAppError(400, "ARCHIVE_REQUIRES_ARCHIVE_FLOW", "Use the archive action for archived lifecycle changes");
  }

  const allowed = ACTIVE_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw createAppError(
      400,
      "INVALID_VEHICLE_STATUS_TRANSITION",
      `Vehicle status cannot change from ${currentStatus} to ${nextStatus}`,
    );
  }
};

export const getRestoreVehicleStatus = (requestedStatus?: string | null): VehicleStatus => {
  const fallback: VehicleStatus = "ACTIVE";
  if (!requestedStatus) {
    return fallback;
  }

  const allowed = new Set<VehicleStatus>([
    "ACTIVE",
    "IN_SERVICE",
    "UNDER_REPAIR",
    "INACTIVE",
    "DAMAGED",
    "IN_LEASING",
    "SOLD",
    "MAINTENANCE",
    "TRANSFER_PENDING",
    "TRANSFERRED",
  ]);

  return allowed.has(requestedStatus as VehicleStatus) ? (requestedStatus as VehicleStatus) : fallback;
};
