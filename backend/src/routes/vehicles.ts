import {
  ActionType,
  MaintenanceStatus,
  Prisma,
  SystemEntityType,
  VehicleDamageStatus,
  VehicleDocumentType,
  VehicleIncidentStatus,
  VehicleStatus,
} from "@prisma/client";
import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate, requireManagerOrAdmin, requirePlatformAdmin } from "../middleware/auth.js";
import {
  archiveActionSchema,
  maintenanceRecordSchema,
  publicVehicleShareCreateSchema,
  statusSchema,
  transferSchema,
  vehicleRestoreSchema,
  vehicleLocationQuerySchema,
  vehicleLocationUpdateSchema,
  vehicleDocumentCreateSchema,
  vehicleSchema,
} from "../validation/schemas.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { assertVehicleCapacity } from "../services/billing.js";
import {
  emitNotificationEvent,
  emitNotificationEvents,
  getCompanyNotificationRecipients,
} from "../services/notifications.js";
import {
  assertVehicleStatusTransition,
  buildArchivedVehicleWhere,
  getRestoreVehicleStatus,
  isArchivedVehicle,
  resolveArchivedView,
} from "../services/vehicleLifecycle.js";
import {
  buildStoredFileMetadata,
  getDownloadFileName,
  getPublicImageUrl,
  readStoredFile,
  removeStoredFile,
  vehicleDocumentUpload,
  vehicleImageUpload,
} from "../utils/vehicleFiles.js";
import { generatePublicShareToken, hashPublicShareToken } from "../utils/publicLinks.js";

const router = Router();

const NOTIFICATION_RELEVANT_STATUSES: VehicleStatus[] = ["ACTIVE", "IN_SERVICE", "IN_LEASING", "MAINTENANCE", "UNDER_REPAIR", "DAMAGED"];
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const SORTABLE_FIELDS = new Set([
  "model",
  "plate",
  "driver",
  "status",
  "mileage",
  "updatedAt",
  "tuvDate",
  "insuranceEnd",
  "contractEnd",
  "lastUpdate",
]);

const toHistoryJson = (value: unknown): Prisma.InputJsonValue | null =>
  value == null ? null : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

const serializeIncidentForHistory = (incident: {
  id?: string;
  title: string;
  description: string;
  status: VehicleIncidentStatus;
  occurredAt: Date | string;
  repairedAt?: Date | string | null;
  repairNotes?: string | null;
}) => ({
  id: incident.id,
  title: incident.title,
  description: incident.description,
  status: incident.status,
  occurredAt: incident.occurredAt instanceof Date ? incident.occurredAt.toISOString() : incident.occurredAt,
  repairedAt:
    incident.repairedAt instanceof Date
      ? incident.repairedAt.toISOString()
      : incident.repairedAt ?? null,
  repairNotes: incident.repairNotes ?? null,
});

const serializeDocumentForHistory = (document: {
  id?: string;
  title: string;
  documentType: VehicleDocumentType | string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  expiryDate?: Date | string | null;
  incidentId?: string | null;
  archivedAt?: Date | string | null;
  archiveReason?: string | null;
}) => ({
  id: document.id,
  title: document.title,
  documentType: document.documentType,
  originalName: document.originalName,
  sizeBytes: document.sizeBytes,
  mimeType: document.mimeType,
  expiryDate:
    document.expiryDate instanceof Date
      ? document.expiryDate.toISOString()
      : document.expiryDate ?? null,
  incidentId: document.incidentId ?? null,
  archivedAt:
    document.archivedAt instanceof Date
      ? document.archivedAt.toISOString()
      : document.archivedAt ?? null,
  archiveReason: document.archiveReason ?? null,
});

const serializeMaintenanceForHistory = (record: {
  id?: string;
  title: string;
  status: MaintenanceStatus | string;
  description?: string | null;
  serviceDate?: Date | string | null;
  completedAt?: Date | string | null;
  cost?: number | null;
  vendor?: string | null;
  mileage?: number | null;
  reminderDate?: Date | string | null;
  archivedAt?: Date | string | null;
  archiveReason?: string | null;
}) => ({
  id: record.id,
  title: record.title,
  status: record.status,
  description: record.description ?? null,
  serviceDate: record.serviceDate instanceof Date ? record.serviceDate.toISOString() : record.serviceDate ?? null,
  completedAt: record.completedAt instanceof Date ? record.completedAt.toISOString() : record.completedAt ?? null,
  cost: record.cost ?? null,
  vendor: record.vendor ?? null,
  mileage: record.mileage ?? null,
  reminderDate:
    record.reminderDate instanceof Date ? record.reminderDate.toISOString() : record.reminderDate ?? null,
  archivedAt:
    record.archivedAt instanceof Date ? record.archivedAt.toISOString() : record.archivedAt ?? null,
  archiveReason: record.archiveReason ?? null,
});

const buildVehicleHistorySnapshot = (
  data: Record<string, any>,
  incidents: Array<{
    id?: string;
    title: string;
    description: string;
    status: VehicleIncidentStatus;
    occurredAt: Date | string;
    repairedAt?: Date | string | null;
    repairNotes?: string | null;
  }> = [],
) => ({
  ...data,
  incidents: incidents.map(serializeIncidentForHistory),
});

const vehicleDetailInclude = {
  company: {
    select: { id: true, name: true },
  },
  incidents: {
    orderBy: { occurredAt: "desc" as const },
    include: {
      attachments: {
        orderBy: { createdAt: "desc" as const },
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      },
    },
  },
  documents: {
    where: { incidentId: null },
    orderBy: { createdAt: "desc" as const },
    include: {
      uploadedBy: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  },
  maintenanceRecords: {
    orderBy: [{ reminderDate: "asc" as const }, { createdAt: "desc" as const }],
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.VehicleInclude;

const createHistory = async (
  tx: Prisma.TransactionClient,
  vehicleId: string,
  actionType: ActionType,
  changedById: string,
  oldData: Prisma.InputJsonValue | null,
  newData: Prisma.InputJsonValue | null,
) => {
  await tx.vehicleHistory.create({
    data: {
      vehicleId,
      actionType,
      changedById,
      oldData: oldData ?? Prisma.JsonNull,
      newData: newData ?? Prisma.JsonNull,
    },
  });
};

const syncVehicleIncidents = async (
  tx: Prisma.TransactionClient,
  vehicleId: string,
  companyId: string,
  changedById: string,
  incidentPayloads: Array<Record<string, any>>,
  existingIncidents: Array<{
    id: string;
    title: string;
    description: string;
    status: VehicleIncidentStatus;
    occurredAt: Date;
    repairedAt: Date | null;
    repairNotes: string | null;
  }>,
) => {
  const existingById = new Map(existingIncidents.map((incident) => [incident.id, incident]));

  for (const payload of incidentPayloads) {
    if (payload.id && existingById.has(payload.id)) {
      const existing = existingById.get(payload.id)!;
      const updateData = normalizeIncidentData(payload, vehicleId);

      if (!hasIncidentChanged(existing, updateData)) {
        continue;
      }

      const updatedIncident = await tx.vehicleIncident.update({
        where: { id: existing.id },
        data: {
          title: updateData.title,
          description: updateData.description,
          status: updateData.status,
          occurredAt: updateData.occurredAt,
          repairedAt: updateData.repairedAt,
          repairNotes: updateData.repairNotes,
        },
      });

      await createHistory(
        tx,
        vehicleId,
        ActionType.INCIDENT,
        changedById,
        toHistoryJson({
          incident: serializeIncidentForHistory(existing),
        }),
        toHistoryJson({
          incident: serializeIncidentForHistory(updatedIncident),
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: changedById,
        companyId,
        action: "VEHICLE_INCIDENT_UPDATE",
        entityType: SystemEntityType.VEHICLE,
        entityId: vehicleId,
        metadata: {
          incidentId: updatedIncident.id,
          title: updatedIncident.title,
          status: updatedIncident.status,
        },
      });

      await notifyCompanyOperators(tx, companyId, {
        actorUserId: changedById,
        action: "VEHICLE_INCIDENT_UPDATE_NOTIFICATION",
        entityType: SystemEntityType.VEHICLE,
        entityId: vehicleId,
        title: "Incident updated",
        message: `${updatedIncident.title} was updated.`,
        priority: updatedIncident.status === "UNRESOLVED" ? "HIGH" : "LOW",
        link: `/vehicles/${vehicleId}?tab=incidents`,
        sourceKey: `incident-update:${updatedIncident.id}:${updatedIncident.status}`,
        metadata: {
          vehicleId,
          companyId,
          incidentId: updatedIncident.id,
          title: updatedIncident.title,
          status: updatedIncident.status,
        },
      });

      continue;
    }

    const createData = normalizeIncidentData(payload, vehicleId);
    const createdIncident = await tx.vehicleIncident.create({
      data: createData,
    });

    await createHistory(
      tx,
      vehicleId,
      ActionType.INCIDENT,
      changedById,
      null,
      toHistoryJson({
        incident: serializeIncidentForHistory(createdIncident),
      }),
    );

    await createSystemLogFromUnknown(tx, {
      userId: changedById,
      companyId,
      action: "VEHICLE_INCIDENT_CREATE",
      entityType: SystemEntityType.VEHICLE,
      entityId: vehicleId,
      metadata: {
        incidentId: createdIncident.id,
        title: createdIncident.title,
        status: createdIncident.status,
      },
    });

    await notifyCompanyOperators(tx, companyId, {
      actorUserId: changedById,
      action: "VEHICLE_INCIDENT_CREATE_NOTIFICATION",
      entityType: SystemEntityType.VEHICLE,
      entityId: vehicleId,
      title: "Incident added",
      message: `${createdIncident.title} was added to the vehicle incident timeline.`,
      priority: createdIncident.status === "UNRESOLVED" ? "HIGH" : "LOW",
      link: `/vehicles/${vehicleId}?tab=incidents`,
      sourceKey: `incident-create:${createdIncident.id}`,
      metadata: {
        vehicleId,
        companyId,
        incidentId: createdIncident.id,
        title: createdIncident.title,
        status: createdIncident.status,
      },
    });
  }
};

const canAccessCompany = (user: NonNullable<AuthRequest["user"]>, companyId: string) =>
  user.isPlatformAdmin || user.companyId === companyId;

const getScopedVehicleWhere = (
  user: NonNullable<AuthRequest["user"]>,
  selectedCompanyId?: string,
  archivedView: "active" | "archived" | "all" = "active",
): Prisma.VehicleWhereInput => {
  if (user.isPlatformAdmin) {
    return {
      ...buildArchivedVehicleWhere(archivedView),
      ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}),
    };
  }

  return {
    companyId: user.companyId,
    ...buildArchivedVehicleWhere(archivedView),
  };
};

const notifyCompanyOperators = async (
  tx: Prisma.TransactionClient,
  companyId: string,
  input: {
    actorUserId: string;
    action: string;
    entityType: SystemEntityType;
    entityId?: string | null;
    title: string;
    message: string;
    priority?: "LOW" | "MEDIUM" | "HIGH";
    link?: string;
    sourceKey?: string;
    metadata?: Record<string, unknown>;
    excludeUserIds?: string[];
  },
) => {
  const recipients = await getCompanyNotificationRecipients(tx, companyId, {
    minimumRole: "MANAGER",
    excludeUserIds: Array.from(new Set([input.actorUserId, ...(input.excludeUserIds ?? [])])),
  });

  await emitNotificationEvents(
    tx,
    recipients.map((recipient) => ({
      userId: recipient.id,
      companyId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      channel: "IN_APP" as const,
      payload: {
        notificationType:
          input.entityType === SystemEntityType.MAINTENANCE
            ? "MAINTENANCE"
            : input.entityType === SystemEntityType.DOCUMENT
              ? "DOCUMENT"
              : input.entityType === SystemEntityType.VEHICLE
                ? "VEHICLE"
                : input.entityType === SystemEntityType.TICKET
                  ? "SUPPORT"
                  : "SYSTEM",
        title: input.title,
        message: input.message,
        priority: input.priority ?? "MEDIUM",
        link: input.link,
        sourceKey: input.sourceKey ? `${input.sourceKey}:${recipient.id}` : undefined,
        companyId,
        ...(input.metadata ?? {}),
      },
    })),
  );
};

const getVehicleOrderBy = (
  sortField?: string,
  sortOrder?: string,
): Prisma.VehicleOrderByWithRelationInput => {
  const direction: Prisma.SortOrder = sortOrder === "asc" ? "asc" : "desc";

  if (sortField === "company") {
    return { company: { name: direction } };
  }

  if (sortField && SORTABLE_FIELDS.has(sortField)) {
    return {
      [sortField]: direction,
    } as Prisma.VehicleOrderByWithRelationInput;
  }

  return { updatedAt: "desc" };
};

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
};

const normalizeVehicleData = (
  payload: Record<string, any>,
  companyId: string,
): Prisma.VehicleUncheckedCreateInput => ({
  companyId,
  model: payload.model,
  firstRegistration: new Date(payload.firstRegistration),
  vin: payload.vin,
  hsn: payload.hsn,
  tsn: payload.tsn,
  price: Number(payload.price),
  tuvDate: new Date(payload.tuvDate),
  tireStorage: payload.tireStorage ?? "",
  plate: payload.plate,
  lastUpdate: new Date(payload.lastUpdate),
  driver: payload.driver,
  contractType: payload.contractType,
  contractValue: Number(payload.contractValue),
  interest: Number(payload.interest),
  contractStart: new Date(payload.contractStart),
  contractEnd: new Date(payload.contractEnd),
  leasingPartner: payload.leasingPartner,
  customerNumber: payload.customerNumber,
  inventoryNumber: payload.inventoryNumber,
  contractPartner: payload.contractPartner,
  billingFrom: new Date(payload.billingFrom),
  leasingRate: Number(payload.leasingRate),
  billedTo: new Date(payload.billedTo),
  insurancePartner: payload.insurancePartner,
  insuranceNumber: payload.insuranceNumber,
  insuranceCost: Number(payload.insuranceCost),
  insuranceStart: new Date(payload.insuranceStart),
  insuranceEnd: new Date(payload.insuranceEnd),
  mileage: payload.mileage,
  yearlyMileage: payload.yearlyMileage,
  taxPerYear: Number(payload.taxPerYear),
  paymentDate: new Date(payload.paymentDate),
  status: payload.status,
  hadPreviousAccidents: Boolean(payload.hadPreviousAccidents) || (payload.incidents?.length ?? 0) > 0,
  damageStatus: payload.damageStatus as VehicleDamageStatus,
  damageNotes: payload.damageNotes || null,
  imageUrl: payload.imageUrl,
});

const normalizeIncidentData = (payload: Record<string, any>, vehicleId: string): Prisma.VehicleIncidentUncheckedCreateInput => ({
  vehicleId,
  title: payload.title,
  description: payload.description,
  status: payload.status as VehicleIncidentStatus,
  occurredAt: new Date(payload.occurredAt),
  repairedAt: payload.repairedAt ? new Date(payload.repairedAt) : null,
  repairNotes: payload.repairNotes || null,
});

const normalizeMaintenanceData = (
  payload: Record<string, any>,
  vehicleId: string,
  userId: string,
): Prisma.VehicleMaintenanceRecordUncheckedCreateInput => ({
  vehicleId,
  title: payload.title,
  description: payload.description || null,
  status: payload.status as MaintenanceStatus,
  serviceDate: payload.serviceDate ? new Date(payload.serviceDate) : null,
  completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
  cost: payload.cost ? Number(payload.cost) : null,
  vendor: payload.vendor || null,
  mileage: typeof payload.mileage === "number" ? payload.mileage : null,
  reminderDate: payload.reminderDate ? new Date(payload.reminderDate) : null,
  createdById: userId,
  updatedById: userId,
});

const hasIncidentChanged = (
  existing: {
    title: string;
    description: string;
    status: VehicleIncidentStatus;
    occurredAt: Date;
    repairedAt: Date | null;
    repairNotes: string | null;
  },
  next: Prisma.VehicleIncidentUncheckedCreateInput,
) =>
  existing.title !== next.title ||
  existing.description !== next.description ||
  existing.status !== next.status ||
  existing.occurredAt.getTime() !== (next.occurredAt as Date).getTime() ||
  (existing.repairedAt?.getTime() ?? null) !== ((next.repairedAt as Date | null)?.getTime() ?? null) ||
  (existing.repairNotes ?? null) !== (next.repairNotes ?? null);

const ensureTargetCompany = async (companyId: string) => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });

  return Boolean(company);
};

const shouldNotifySoon = (value?: Date | null) =>
  Boolean(value && value.getTime() <= Date.now() + 30 * 24 * 60 * 60 * 1000);

const buildNotifications = (
  vehicles: Array<{
    id: string;
    model: string;
    plate: string;
    status: VehicleStatus;
    tuvDate: Date;
    insuranceEnd: Date;
    contractEnd: Date;
    company: { name: string };
  }>,
) => {
  const now = new Date();
  const alerts = vehicles.flatMap((vehicle) => {
    const items = [
      {
        type: "TUV",
        dueDate: vehicle.tuvDate,
        title: "TUV expires soon",
      },
      {
        type: "INSURANCE",
        dueDate: vehicle.insuranceEnd,
        title: "Insurance expires soon",
      },
      {
        type: "CONTRACT",
        dueDate: vehicle.contractEnd,
        title: "Contract ends soon",
      },
    ];

    return items
      .filter((item) => item.dueDate.getTime() <= now.getTime() + 30 * 24 * 60 * 60 * 1000)
      .map((item) => {
        const diffDays = Math.ceil((item.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        return {
          id: `${vehicle.id}-${item.type}`,
          type: item.type,
          severity: diffDays <= 0 ? "red" : diffDays <= 7 ? "yellow" : "green",
          title: item.title,
          dueDate: item.dueDate.toISOString(),
          daysRemaining: diffDays,
          vehicle: {
            id: vehicle.id,
            model: vehicle.model,
            plate: vehicle.plate,
            status: vehicle.status,
            companyName: vehicle.company.name,
          },
        };
      });
  });

  return alerts.sort((left, right) => left.daysRemaining - right.daysRemaining).slice(0, 12);
};

const createDocumentRecord = async (
  tx: Prisma.TransactionClient,
  input: {
    vehicleId: string;
    uploadedById: string;
    title: string;
    documentType: VehicleDocumentType;
    originalName: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    expiryDate?: string;
    incidentId?: string | null;
  },
) =>
  tx.vehicleDocument.create({
    data: {
      vehicleId: input.vehicleId,
      incidentId: input.incidentId ?? null,
      uploadedById: input.uploadedById,
      title: input.title,
      documentType: input.documentType,
      originalName: input.originalName,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
    },
    include: {
      uploadedBy: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

const archiveVehicleRecord = async (
  tx: Prisma.TransactionClient,
  vehicle: {
    id: string;
    companyId: string;
    vin: string;
    model: string;
    status: VehicleStatus;
    archivedAt?: Date | null;
    deletedAt?: Date | null;
  },
  actorUserId: string,
  reason?: string,
) => {
  if (isArchivedVehicle(vehicle)) {
    return null;
  }

  const archivedAt = new Date();
  const updatedVehicle = await tx.vehicle.update({
    where: { id: vehicle.id },
    data: {
      archivedAt,
      archivedByUserId: actorUserId,
      archiveReason: reason ?? null,
      status: "ARCHIVED",
      deletedAt: archivedAt,
    },
  });

  await createHistory(
    tx,
    vehicle.id,
    ActionType.ARCHIVE,
    actorUserId,
    toHistoryJson({
      status: vehicle.status,
      archivedAt: vehicle.archivedAt ?? vehicle.deletedAt ?? null,
      archiveReason: null,
    }),
    toHistoryJson({
      status: "ARCHIVED",
      archivedAt: archivedAt.toISOString(),
      archiveReason: reason ?? null,
    }),
  );

  await createSystemLogFromUnknown(tx, {
    userId: actorUserId,
    companyId: vehicle.companyId,
    action: "VEHICLE_ARCHIVE",
    entityType: SystemEntityType.VEHICLE,
    entityId: vehicle.id,
    metadata: {
      companyId: vehicle.companyId,
      vin: vehicle.vin,
      model: vehicle.model,
      previousStatus: vehicle.status,
      nextStatus: "ARCHIVED",
      archiveReason: reason ?? null,
    },
  });

  await notifyCompanyOperators(tx, vehicle.companyId, {
    actorUserId,
    action: "VEHICLE_ARCHIVE_NOTIFICATION",
    entityType: SystemEntityType.VEHICLE,
    entityId: vehicle.id,
    title: "Vehicle archived",
    message: `${vehicle.model} was archived and hidden from active fleet views.`,
    priority: "MEDIUM",
    link: `/vehicles/${vehicle.id}`,
    sourceKey: `vehicle-archive:${vehicle.id}:${archivedAt.toISOString()}`,
    metadata: {
      vehicleId: vehicle.id,
      model: vehicle.model,
      companyId: vehicle.companyId,
      archiveReason: reason ?? null,
    },
  });

  return updatedVehicle;
};

const restoreVehicleRecord = async (
  tx: Prisma.TransactionClient,
  vehicle: {
    id: string;
    companyId: string;
    vin: string;
    model: string;
    status: VehicleStatus;
    archivedAt?: Date | null;
    deletedAt?: Date | null;
    archiveReason?: string | null;
  },
  actorUserId: string,
  nextStatus: VehicleStatus,
) => {
  if (!isArchivedVehicle(vehicle)) {
    return null;
  }

  const restoredVehicle = await tx.vehicle.update({
    where: { id: vehicle.id },
    data: {
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: null,
      deletedAt: null,
      status: nextStatus,
    },
  });

  await createHistory(
    tx,
    vehicle.id,
    ActionType.RESTORE,
    actorUserId,
    toHistoryJson({
      status: vehicle.status,
      archivedAt: vehicle.archivedAt ?? vehicle.deletedAt ?? null,
      archiveReason: vehicle.archiveReason ?? null,
    }),
    toHistoryJson({
      status: nextStatus,
      archivedAt: null,
      archiveReason: null,
    }),
  );

  await createSystemLogFromUnknown(tx, {
    userId: actorUserId,
    companyId: vehicle.companyId,
    action: "VEHICLE_RESTORE",
    entityType: SystemEntityType.VEHICLE,
    entityId: vehicle.id,
    metadata: {
      companyId: vehicle.companyId,
      vin: vehicle.vin,
      model: vehicle.model,
      previousStatus: vehicle.status,
      nextStatus,
    },
  });

  await notifyCompanyOperators(tx, vehicle.companyId, {
    actorUserId,
    action: "VEHICLE_RESTORE_NOTIFICATION",
    entityType: SystemEntityType.VEHICLE,
    entityId: vehicle.id,
    title: "Vehicle restored",
    message: `${vehicle.model} returned to active fleet views.`,
    priority: "LOW",
    link: `/vehicles/${vehicle.id}`,
    sourceKey: `vehicle-restore:${vehicle.id}:${nextStatus}`,
    metadata: {
      vehicleId: vehicle.id,
      model: vehicle.model,
      companyId: vehicle.companyId,
      nextStatus,
    },
  });

  return restoredVehicle;
};

router.get("/analytics/summary", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const scope = getScopedVehicleWhere(req.user!, companyId);
    const activeScope = {
      ...scope,
      status: { in: NOTIFICATION_RELEVANT_STATUSES },
    } satisfies Prisma.VehicleWhereInput;

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [statusCounts, tuvExpiring, insuranceExpiring, contractEnding, notificationSource] = await Promise.all([
      prisma.vehicle.groupBy({
        by: ["status"],
        where: scope,
        _count: { _all: true },
      }),
      prisma.vehicle.count({
        where: {
          ...activeScope,
          tuvDate: { gte: now, lte: thirtyDaysFromNow },
        },
      }),
      prisma.vehicle.count({
        where: {
          ...activeScope,
          insuranceEnd: { gte: now, lte: thirtyDaysFromNow },
        },
      }),
      prisma.vehicle.count({
        where: {
          ...activeScope,
          contractEnd: { gte: now, lte: thirtyDaysFromNow },
        },
      }),
      prisma.vehicle.findMany({
        where: {
          ...activeScope,
          OR: [
            { tuvDate: { lte: thirtyDaysFromNow } },
            { insuranceEnd: { lte: thirtyDaysFromNow } },
            { contractEnd: { lte: thirtyDaysFromNow } },
          ],
        },
        select: {
          id: true,
          model: true,
          plate: true,
          status: true,
          tuvDate: true,
          insuranceEnd: true,
          contractEnd: true,
          company: {
            select: { name: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
    ]);

    const countByStatus = Object.fromEntries(
      statusCounts.map((entry) => [entry.status, entry._count._all]),
    ) as Partial<Record<VehicleStatus, number>>;

    const totalVehicles = statusCounts.reduce((sum, entry) => sum + entry._count._all, 0);
    const activeVehicles = countByStatus.ACTIVE ?? 0;
    const inLeasingVehicles = countByStatus.IN_LEASING ?? 0;
    const soldVehicles = countByStatus.SOLD ?? 0;

    res.json({
      data: {
        totalVehicles,
        activeVehicles,
        inLeasingVehicles,
        soldVehicles,
        tuvExpiring,
        insuranceExpiring,
        contractEnding,
        notifications: buildNotifications(notificationSource),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/search/global", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    const limitValue = typeof req.query.limit === "string" ? Number(req.query.limit) : 8;
    const take = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 20) : 8;
    const archivedView = resolveArchivedView(typeof req.query.archived === "string" ? req.query.archived : undefined);

    if (!query) {
      return res.json({ data: [] });
    }

    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const results = await prisma.vehicle.findMany({
      where: {
        ...getScopedVehicleWhere(req.user!, companyId, archivedView),
        OR: [
          { vin: { contains: query, mode: "insensitive" } },
          { plate: { contains: query, mode: "insensitive" } },
          { model: { contains: query, mode: "insensitive" } },
          { driver: { contains: query, mode: "insensitive" } },
          { company: { name: { contains: query, mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        model: true,
        plate: true,
        vin: true,
        driver: true,
        status: true,
        company: {
          select: { id: true, name: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take,
    });

    res.json({ data: results });
  } catch (error) {
    next(error);
  }
});

router.get("/", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const archivedView = resolveArchivedView(typeof req.query.archived === "string" ? req.query.archived : undefined);
    const sortField = typeof req.query.sortField === "string" ? req.query.sortField : undefined;
    const sortOrder = typeof req.query.sortOrder === "string" ? req.query.sortOrder : undefined;
    const requestedPage = parsePositiveInt(req.query.page, 1);
    const requestedPageSize = Math.min(parsePositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

    const filters: Prisma.VehicleWhereInput = {
      ...getScopedVehicleWhere(req.user!, companyId, archivedView),
      ...(status ? { status: status as VehicleStatus } : {}),
      ...(search
        ? {
            OR: [
              { model: { contains: search, mode: "insensitive" } },
              { vin: { contains: search, mode: "insensitive" } },
              { plate: { contains: search, mode: "insensitive" } },
              { driver: { contains: search, mode: "insensitive" } },
              { company: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const total = await prisma.vehicle.count({ where: filters });
    const totalPages = Math.max(1, Math.ceil(total / requestedPageSize));
    const page = Math.min(requestedPage, totalPages);

    const vehicles = await prisma.vehicle.findMany({
      where: filters,
      select: {
        id: true,
        companyId: true,
        model: true,
        vin: true,
        plate: true,
        driver: true,
        mileage: true,
        status: true,
        hadPreviousAccidents: true,
        damageStatus: true,
        imageUrl: true,
        latitude: true,
        longitude: true,
        lastLocationUpdate: true,
        archivedAt: true,
        deletedAt: true,
        archiveReason: true,
        updatedAt: true,
        incidents: {
          select: { id: true },
        },
        company: {
          select: { id: true, name: true },
        },
      },
      orderBy: getVehicleOrderBy(sortField, sortOrder),
      skip: (page - 1) * requestedPageSize,
      take: requestedPageSize,
    });

    res.json({
      data: {
        items: vehicles.map(({ incidents, ...vehicle }) => ({
          ...vehicle,
          incidentCount: incidents.length,
        })),
        pagination: {
          page,
          pageSize: requestedPageSize,
          total,
          totalPages,
          hasPreviousPage: page > 1,
          hasNextPage: page < totalPages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/location", authenticate, validateQuery(vehicleLocationQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { companyId, search, status } = req.query as unknown as {
      companyId?: string;
      search?: string;
      status?: VehicleStatus;
    };

    const where: Prisma.VehicleWhereInput = {
      ...getScopedVehicleWhere(req.user!, companyId, "active"),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { model: { contains: search, mode: "insensitive" } },
              { vin: { contains: search, mode: "insensitive" } },
              { plate: { contains: search, mode: "insensitive" } },
              { driver: { contains: search, mode: "insensitive" } },
              { company: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const vehicles = await prisma.vehicle.findMany({
      where,
      select: {
        id: true,
        companyId: true,
        model: true,
        vin: true,
        plate: true,
        driver: true,
        mileage: true,
        status: true,
        hadPreviousAccidents: true,
        damageStatus: true,
        imageUrl: true,
        latitude: true,
        longitude: true,
        lastLocationUpdate: true,
        updatedAt: true,
        incidents: {
          select: { id: true },
        },
        company: {
          select: { id: true, name: true },
        },
      } as any,
      orderBy: [
        { lastLocationUpdate: "desc" } as any,
        { updatedAt: "desc" },
      ],
    });

    res.json({
      data: vehicles.map(({ incidents, ...vehicle }) => ({
        ...vehicle,
        incidentCount: incidents.length,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/location", authenticate, requireManagerOrAdmin, validateBody(vehicleLocationUpdateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.vehicle.findUnique({
      where: { id: req.body.vehicleId },
    }) as any;

    if (!existing || isArchivedVehicle(existing) || !canAccessCompany(req.user!, existing.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    const locationTimestamp = req.body.lastLocationUpdate ? new Date(req.body.lastLocationUpdate) : new Date();
    const update = {
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      lastLocationUpdate: locationTimestamp,
    } as any;

    const vehicle = await prisma.$transaction(async (tx) => {
      const updatedVehicle = await tx.vehicle.update({
        where: { id: existing.id },
        data: update,
      });

      await createHistory(
        tx,
        updatedVehicle.id,
        ActionType.UPDATE,
        req.user!.id,
        toHistoryJson({
          latitude: existing.latitude,
          longitude: existing.longitude,
          lastLocationUpdate: existing.lastLocationUpdate?.toISOString() ?? null,
        }),
        toHistoryJson({
          latitude: req.body.latitude,
          longitude: req.body.longitude,
          lastLocationUpdate: locationTimestamp.toISOString(),
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        action: "VEHICLE_LOCATION_UPDATE",
        entityType: SystemEntityType.VEHICLE,
        entityId: updatedVehicle.id,
        metadata: {
          vin: existing.vin,
          model: existing.model,
          companyId: existing.companyId,
          previousLatitude: existing.latitude,
          previousLongitude: existing.longitude,
          nextLatitude: req.body.latitude,
          nextLongitude: req.body.longitude,
          lastLocationUpdate: locationTimestamp.toISOString(),
        },
      });

      return updatedVehicle;
    });

    res.json({ data: vehicle });
  } catch (error) {
    next(error);
  }
});

router.get("/documents/:documentId/download", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const document = await prisma.vehicleDocument.findUnique({
      where: { id: req.params.documentId },
      include: {
        vehicle: {
          select: {
            id: true,
            model: true,
            companyId: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!document || !canAccessCompany(req.user!, document.vehicle.companyId)) {
      return res.status(404).json({
        code: "DOCUMENT_NOT_FOUND",
        message: "Document not found",
      });
    }

    const { absolutePath } = await readStoredFile(document.storagePath);
    res.sendFile(absolutePath, {
      headers: {
        "Content-Disposition": `inline; filename="${encodeURIComponent(getDownloadFileName(document.originalName))}"`,
      },
    }, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({
          code: "DOCUMENT_FILE_NOT_FOUND",
          message: "Stored document file not found",
        });
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/documents",
  authenticate,
  requireManagerOrAdmin,
  vehicleDocumentUpload.single("file"),
  validateBody(vehicleDocumentCreateSchema),
  async (req: AuthRequest & { file?: Express.Multer.File }, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          code: "DOCUMENT_FILE_REQUIRED",
          message: "Document file is required",
        });
      }

      const fileMetadata = buildStoredFileMetadata(req.file);

      const vehicle = await prisma.vehicle.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          model: true,
          companyId: true,
          status: true,
          archivedAt: true,
          deletedAt: true,
        },
      });

      if (!vehicle || isArchivedVehicle(vehicle) || !canAccessCompany(req.user!, vehicle.companyId)) {
        await removeStoredFile(fileMetadata.storagePath);
        return res.status(404).json({
          code: "VEHICLE_NOT_FOUND",
          message: "Vehicle not found",
        });
      }

      let incidentId: string | null = null;
      if (req.body.incidentId) {
        const incident = await prisma.vehicleIncident.findFirst({
          where: {
            id: req.body.incidentId,
            vehicleId: vehicle.id,
          },
          select: { id: true },
        });

        if (!incident) {
          await removeStoredFile(fileMetadata.storagePath);
          return res.status(400).json({
            code: "INCIDENT_NOT_FOUND",
            message: "Incident not found",
          });
        }

        incidentId = incident.id;
      }

      const document = await prisma.$transaction(async (tx) => {
        const createdDocument = await createDocumentRecord(tx, {
          vehicleId: vehicle.id,
          uploadedById: req.user!.id,
          title: req.body.title,
          documentType: req.body.documentType as VehicleDocumentType,
          expiryDate: req.body.expiryDate,
          incidentId,
          ...fileMetadata,
        });

        await createHistory(
          tx,
          vehicle.id,
          ActionType.DOCUMENT,
          req.user!.id,
          null,
          toHistoryJson({
            document: serializeDocumentForHistory(createdDocument),
          }),
        );

        await createSystemLogFromUnknown(tx, {
          userId: req.user!.id,
          companyId: vehicle.companyId,
          action: incidentId ? "INCIDENT_ATTACHMENT_UPLOAD" : "VEHICLE_DOCUMENT_UPLOAD",
          entityType: SystemEntityType.DOCUMENT,
          entityId: createdDocument.id,
          metadata: {
            vehicleId: vehicle.id,
            companyId: vehicle.companyId,
            incidentId,
            title: createdDocument.title,
            documentType: createdDocument.documentType,
            sizeBytes: createdDocument.sizeBytes,
          },
        });

        if (incidentId) {
          await notifyCompanyOperators(tx, vehicle.companyId, {
            actorUserId: req.user!.id,
            action: "INCIDENT_UPDATE_NOTIFICATION",
            entityType: SystemEntityType.DOCUMENT,
            entityId: createdDocument.id,
            title: "Incident evidence updated",
            message: `${createdDocument.title} was attached to a vehicle incident.`,
            priority: "MEDIUM",
            link: `/vehicles/${vehicle.id}?tab=incidents`,
            sourceKey: `incident-attachment:${createdDocument.id}`,
            metadata: {
              vehicleId: vehicle.id,
              incidentId,
              title: createdDocument.title,
              companyId: vehicle.companyId,
            },
          });
        }

        if (shouldNotifySoon(createdDocument.expiryDate)) {
          await emitNotificationEvent(tx, {
            userId: req.user!.id,
            action: "DOCUMENT_EXPIRY_REMINDER_READY",
            entityType: SystemEntityType.DOCUMENT,
            entityId: createdDocument.id,
            channel: "IN_APP",
            payload: {
              vehicleId: vehicle.id,
              companyId: vehicle.companyId,
              title: createdDocument.title,
              expiryDate: createdDocument.expiryDate?.toISOString() ?? null,
            },
          });
        }

        return createdDocument;
      });

      res.status(201).json({ data: document });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/incidents/:incidentId/attachments",
  authenticate,
  requireManagerOrAdmin,
  vehicleDocumentUpload.single("file"),
  async (req: AuthRequest & { file?: Express.Multer.File }, res: Response, next: NextFunction) => {
    req.body = {
      ...req.body,
      incidentId: req.params.incidentId,
      documentType: "INCIDENT",
      title: req.body.title || req.file?.originalname || "Incident attachment",
    };

    next();
  },
  validateBody(vehicleDocumentCreateSchema),
  async (req: AuthRequest & { file?: Express.Multer.File }, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          code: "DOCUMENT_FILE_REQUIRED",
          message: "Document file is required",
        });
      }

      const fileMetadata = buildStoredFileMetadata(req.file);

      const vehicle = await prisma.vehicle.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          companyId: true,
          status: true,
          archivedAt: true,
          deletedAt: true,
        },
      });

      if (!vehicle || isArchivedVehicle(vehicle) || !canAccessCompany(req.user!, vehicle.companyId)) {
        await removeStoredFile(fileMetadata.storagePath);
        return res.status(404).json({
          code: "VEHICLE_NOT_FOUND",
          message: "Vehicle not found",
        });
      }

      const incident = await prisma.vehicleIncident.findFirst({
        where: {
          id: req.params.incidentId,
          vehicleId: vehicle.id,
        },
        select: { id: true },
      });

      if (!incident) {
        await removeStoredFile(fileMetadata.storagePath);
        return res.status(400).json({
          code: "INCIDENT_NOT_FOUND",
          message: "Incident not found",
        });
      }

      const document = await prisma.$transaction(async (tx) => {
        const createdDocument = await createDocumentRecord(tx, {
          vehicleId: vehicle.id,
          uploadedById: req.user!.id,
          title: req.body.title,
          documentType: "INCIDENT",
          incidentId: incident.id,
          ...fileMetadata,
        });

        await createHistory(
          tx,
          vehicle.id,
          ActionType.DOCUMENT,
          req.user!.id,
          null,
          toHistoryJson({
            document: serializeDocumentForHistory(createdDocument),
          }),
        );

        await createSystemLogFromUnknown(tx, {
          userId: req.user!.id,
          companyId: vehicle.companyId,
          action: "INCIDENT_ATTACHMENT_UPLOAD",
          entityType: SystemEntityType.DOCUMENT,
          entityId: createdDocument.id,
          metadata: {
            vehicleId: vehicle.id,
            incidentId: incident.id,
            companyId: vehicle.companyId,
            title: createdDocument.title,
            sizeBytes: createdDocument.sizeBytes,
          },
        });

        await notifyCompanyOperators(tx, vehicle.companyId, {
          actorUserId: req.user!.id,
          action: "INCIDENT_UPDATE_NOTIFICATION",
          entityType: SystemEntityType.DOCUMENT,
          entityId: createdDocument.id,
          title: "Incident evidence updated",
          message: `${createdDocument.title} was attached to an incident.`,
          priority: "MEDIUM",
          link: `/vehicles/${vehicle.id}?tab=incidents`,
          sourceKey: `incident-attachment:${createdDocument.id}`,
          metadata: {
            vehicleId: vehicle.id,
            incidentId: incident.id,
            title: createdDocument.title,
            companyId: vehicle.companyId,
          },
        });

        return createdDocument;
      });

      res.status(201).json({ data: document });
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id/documents/:documentId", authenticate, requireManagerOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const document = await prisma.vehicleDocument.findFirst({
      where: {
        id: req.params.documentId,
        vehicleId: req.params.id,
      },
      include: {
        vehicle: {
          select: {
            id: true,
            companyId: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!document || !canAccessCompany(req.user!, document.vehicle.companyId)) {
      return res.status(404).json({
        code: "DOCUMENT_NOT_FOUND",
        message: "Document not found",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.vehicleDocument.update({
        where: { id: document.id },
        data: {
          archivedAt: new Date(),
          archivedByUserId: req.user!.id,
          archiveReason: null,
        },
      });

      await createHistory(
        tx,
        document.vehicleId,
        ActionType.DOCUMENT,
        req.user!.id,
        toHistoryJson({
          document: serializeDocumentForHistory(document),
        }),
        toHistoryJson({
          document: serializeDocumentForHistory({
            ...document,
            archivedAt: new Date(),
          }),
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        companyId: document.vehicle.companyId,
        action: document.incidentId ? "INCIDENT_ATTACHMENT_ARCHIVE" : "VEHICLE_DOCUMENT_ARCHIVE",
        entityType: SystemEntityType.DOCUMENT,
        entityId: document.id,
        metadata: {
          vehicleId: document.vehicleId,
          companyId: document.vehicle.companyId,
          incidentId: document.incidentId,
          title: document.title,
          documentType: document.documentType,
        },
      });

      await notifyCompanyOperators(tx, document.vehicle.companyId, {
        actorUserId: req.user!.id,
        action: document.incidentId ? "INCIDENT_ATTACHMENT_ARCHIVE_NOTIFICATION" : "VEHICLE_DOCUMENT_ARCHIVE_NOTIFICATION",
        entityType: SystemEntityType.DOCUMENT,
        entityId: document.id,
        title: document.incidentId ? "Incident attachment archived" : "Vehicle document archived",
        message: `${document.title} was moved out of active records.`,
        priority: "LOW",
        link: `/vehicles/${document.vehicleId}?tab=${document.incidentId ? "incidents" : "documents"}`,
        sourceKey: `document-archive:${document.id}`,
        metadata: {
          vehicleId: document.vehicleId,
          incidentId: document.incidentId,
          title: document.title,
          companyId: document.vehicle.companyId,
        },
      });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/:id/documents/:documentId/restore", authenticate, requireManagerOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const document = await prisma.vehicleDocument.findFirst({
      where: {
        id: req.params.documentId,
        vehicleId: req.params.id,
      },
      include: {
        vehicle: {
          select: {
            id: true,
            companyId: true,
          },
        },
      },
    });

    if (!document || !canAccessCompany(req.user!, document.vehicle.companyId)) {
      return res.status(404).json({
        code: "DOCUMENT_NOT_FOUND",
        message: "Document not found",
      });
    }

    const restoredDocument = await prisma.$transaction(async (tx) => {
      const updatedDocument = await tx.vehicleDocument.update({
        where: { id: document.id },
        data: {
          archivedAt: null,
          archivedByUserId: null,
          archiveReason: null,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      await createHistory(
        tx,
        document.vehicleId,
        ActionType.DOCUMENT,
        req.user!.id,
        toHistoryJson({
          document: serializeDocumentForHistory(document),
        }),
        toHistoryJson({
          document: serializeDocumentForHistory(updatedDocument),
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        companyId: document.vehicle.companyId,
        action: document.incidentId ? "INCIDENT_ATTACHMENT_RESTORE" : "VEHICLE_DOCUMENT_RESTORE",
        entityType: SystemEntityType.DOCUMENT,
        entityId: document.id,
        metadata: {
          vehicleId: document.vehicleId,
          incidentId: document.incidentId,
          title: document.title,
          companyId: document.vehicle.companyId,
        },
      });

      await notifyCompanyOperators(tx, document.vehicle.companyId, {
        actorUserId: req.user!.id,
        action: document.incidentId ? "INCIDENT_ATTACHMENT_RESTORE_NOTIFICATION" : "VEHICLE_DOCUMENT_RESTORE_NOTIFICATION",
        entityType: SystemEntityType.DOCUMENT,
        entityId: document.id,
        title: document.incidentId ? "Incident attachment restored" : "Vehicle document restored",
        message: `${document.title} returned to active records.`,
        priority: "LOW",
        link: `/vehicles/${document.vehicleId}?tab=${document.incidentId ? "incidents" : "documents"}`,
        sourceKey: `document-restore:${document.id}`,
        metadata: {
          vehicleId: document.vehicleId,
          incidentId: document.incidentId,
          title: document.title,
          companyId: document.vehicle.companyId,
        },
      });

      return updatedDocument;
    });

    res.json({ data: restoredDocument });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/maintenance", authenticate, requireManagerOrAdmin, validateBody(maintenanceRecordSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        companyId: true,
        status: true,
        archivedAt: true,
        deletedAt: true,
      },
    });

    if (!vehicle || isArchivedVehicle(vehicle) || !canAccessCompany(req.user!, vehicle.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    const record = await prisma.$transaction(async (tx) => {
      const createdRecord = await tx.vehicleMaintenanceRecord.create({
        data: normalizeMaintenanceData(req.body, vehicle.id, req.user!.id),
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
            },
          },
          updatedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      await createHistory(
        tx,
        vehicle.id,
        ActionType.MAINTENANCE,
        req.user!.id,
        null,
        toHistoryJson({
          maintenance: serializeMaintenanceForHistory(createdRecord),
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        companyId: vehicle.companyId,
        action: "VEHICLE_MAINTENANCE_CREATE",
        entityType: SystemEntityType.MAINTENANCE,
        entityId: createdRecord.id,
        metadata: {
          vehicleId: vehicle.id,
          companyId: vehicle.companyId,
          title: createdRecord.title,
          status: createdRecord.status,
          reminderDate: createdRecord.reminderDate?.toISOString() ?? null,
        },
      });

      if (shouldNotifySoon(createdRecord.reminderDate)) {
        await emitNotificationEvent(tx, {
          userId: req.user!.id,
          action: "MAINTENANCE_REMINDER_READY",
          entityType: SystemEntityType.MAINTENANCE,
          entityId: createdRecord.id,
          channel: "IN_APP",
          payload: {
            vehicleId: vehicle.id,
            companyId: vehicle.companyId,
            title: createdRecord.title,
            reminderDate: createdRecord.reminderDate?.toISOString() ?? null,
          },
        });
      }

      await notifyCompanyOperators(tx, vehicle.companyId, {
        actorUserId: req.user!.id,
        action: "VEHICLE_MAINTENANCE_CREATE_NOTIFICATION",
        entityType: SystemEntityType.MAINTENANCE,
        entityId: createdRecord.id,
        title: "Maintenance created",
        message: `${createdRecord.title} was added to the maintenance plan.`,
        priority: createdRecord.status === "IN_PROGRESS" ? "MEDIUM" : "LOW",
        link: `/vehicles/${vehicle.id}?tab=maintenance`,
        sourceKey: `maintenance-create:${createdRecord.id}`,
        metadata: {
          vehicleId: vehicle.id,
          companyId: vehicle.companyId,
          title: createdRecord.title,
          status: createdRecord.status,
        },
      });

      return createdRecord;
    });

    res.status(201).json({ data: record });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/maintenance/:recordId", authenticate, requireManagerOrAdmin, validateBody(maintenanceRecordSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const record = await prisma.vehicleMaintenanceRecord.findUnique({
      where: { id: req.params.recordId },
      include: {
        vehicle: {
          select: {
            id: true,
            companyId: true,
            status: true,
            archivedAt: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!record || record.vehicleId !== req.params.id || isArchivedVehicle(record.vehicle) || !canAccessCompany(req.user!, record.vehicle.companyId)) {
      return res.status(404).json({
        code: "MAINTENANCE_NOT_FOUND",
        message: "Maintenance record not found",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.vehicleMaintenanceRecord.update({
        where: { id: record.id },
        data: {
          title: req.body.title,
          description: req.body.description || null,
          status: req.body.status,
          serviceDate: req.body.serviceDate ? new Date(req.body.serviceDate) : null,
          completedAt: req.body.completedAt ? new Date(req.body.completedAt) : null,
          cost: req.body.cost ? Number(req.body.cost) : null,
          vendor: req.body.vendor || null,
          mileage: typeof req.body.mileage === "number" ? req.body.mileage : null,
          reminderDate: req.body.reminderDate ? new Date(req.body.reminderDate) : null,
          updatedById: req.user!.id,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
            },
          },
          updatedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      await createHistory(
        tx,
        record.vehicleId,
        ActionType.MAINTENANCE,
        req.user!.id,
        toHistoryJson({
          maintenance: serializeMaintenanceForHistory(record),
        }),
        toHistoryJson({
          maintenance: serializeMaintenanceForHistory(updatedRecord),
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        companyId: record.vehicle.companyId,
        action: "VEHICLE_MAINTENANCE_UPDATE",
        entityType: SystemEntityType.MAINTENANCE,
        entityId: updatedRecord.id,
        metadata: {
          vehicleId: record.vehicleId,
          companyId: record.vehicle.companyId,
          title: updatedRecord.title,
          previousStatus: record.status,
          nextStatus: updatedRecord.status,
        },
      });

      if (updatedRecord.status === "COMPLETED" && record.status !== "COMPLETED") {
        await createSystemLogFromUnknown(tx, {
          userId: req.user!.id,
          companyId: record.vehicle.companyId,
          action: "VEHICLE_MAINTENANCE_COMPLETE",
          entityType: SystemEntityType.MAINTENANCE,
          entityId: updatedRecord.id,
          metadata: {
            vehicleId: record.vehicleId,
            companyId: record.vehicle.companyId,
            title: updatedRecord.title,
            completedAt: updatedRecord.completedAt?.toISOString() ?? null,
          },
        });
      }

      await notifyCompanyOperators(tx, record.vehicle.companyId, {
        actorUserId: req.user!.id,
        action: updatedRecord.status === "COMPLETED" ? "VEHICLE_MAINTENANCE_COMPLETE_NOTIFICATION" : "VEHICLE_MAINTENANCE_UPDATE_NOTIFICATION",
        entityType: SystemEntityType.MAINTENANCE,
        entityId: updatedRecord.id,
        title: updatedRecord.status === "COMPLETED" ? "Maintenance completed" : "Maintenance updated",
        message:
          updatedRecord.status === "COMPLETED"
            ? `${updatedRecord.title} was completed.`
            : `${updatedRecord.title} status is now ${updatedRecord.status}.`,
        priority: updatedRecord.status === "COMPLETED" ? "LOW" : "MEDIUM",
        link: `/vehicles/${record.vehicleId}?tab=maintenance`,
        sourceKey: `maintenance-update:${updatedRecord.id}:${updatedRecord.status}`,
        metadata: {
          vehicleId: record.vehicleId,
          companyId: record.vehicle.companyId,
          title: updatedRecord.title,
          previousStatus: record.status,
          nextStatus: updatedRecord.status,
        },
      });

      return updatedRecord;
    });

    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/maintenance/:recordId", authenticate, requireManagerOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const record = await prisma.vehicleMaintenanceRecord.findUnique({
      where: { id: req.params.recordId },
      include: {
        vehicle: {
          select: {
            id: true,
            companyId: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!record || record.vehicleId !== req.params.id || !canAccessCompany(req.user!, record.vehicle.companyId)) {
      return res.status(404).json({
        code: "MAINTENANCE_NOT_FOUND",
        message: "Maintenance record not found",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.vehicleMaintenanceRecord.update({
        where: { id: record.id },
        data: {
          archivedAt: new Date(),
          archivedByUserId: req.user!.id,
          archiveReason: null,
        },
      });

      await createHistory(
        tx,
        record.vehicleId,
        ActionType.MAINTENANCE,
        req.user!.id,
        toHistoryJson({
          maintenance: serializeMaintenanceForHistory(record),
        }),
        toHistoryJson({
          maintenance: serializeMaintenanceForHistory({
            ...record,
            archivedAt: new Date(),
          }),
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        companyId: record.vehicle.companyId,
        action: "VEHICLE_MAINTENANCE_ARCHIVE",
        entityType: SystemEntityType.MAINTENANCE,
        entityId: record.id,
        metadata: {
          vehicleId: record.vehicleId,
          companyId: record.vehicle.companyId,
          title: record.title,
          status: record.status,
        },
      });

      await notifyCompanyOperators(tx, record.vehicle.companyId, {
        actorUserId: req.user!.id,
        action: "VEHICLE_MAINTENANCE_ARCHIVE_NOTIFICATION",
        entityType: SystemEntityType.MAINTENANCE,
        entityId: record.id,
        title: "Maintenance archived",
        message: `${record.title} was archived.`,
        priority: "LOW",
        link: `/vehicles/${record.vehicleId}?tab=maintenance`,
        sourceKey: `maintenance-archive:${record.id}`,
        metadata: {
          vehicleId: record.vehicleId,
          companyId: record.vehicle.companyId,
          title: record.title,
        },
      });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/:id/maintenance/:recordId/restore", authenticate, requireManagerOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const record = await prisma.vehicleMaintenanceRecord.findUnique({
      where: { id: req.params.recordId },
      include: {
        vehicle: {
          select: {
            id: true,
            companyId: true,
            archivedAt: true,
            deletedAt: true,
            status: true,
          },
        },
      },
    });

    if (!record || record.vehicleId !== req.params.id || !canAccessCompany(req.user!, record.vehicle.companyId)) {
      return res.status(404).json({
        code: "MAINTENANCE_NOT_FOUND",
        message: "Maintenance record not found",
      });
    }

    const restoredRecord = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.vehicleMaintenanceRecord.update({
        where: { id: record.id },
        data: {
          archivedAt: null,
          archivedByUserId: null,
          archiveReason: null,
          updatedById: req.user!.id,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
            },
          },
          updatedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      await createHistory(
        tx,
        record.vehicleId,
        ActionType.MAINTENANCE,
        req.user!.id,
        toHistoryJson({
          maintenance: serializeMaintenanceForHistory(record),
        }),
        toHistoryJson({
          maintenance: serializeMaintenanceForHistory(updatedRecord),
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        companyId: record.vehicle.companyId,
        action: "VEHICLE_MAINTENANCE_RESTORE",
        entityType: SystemEntityType.MAINTENANCE,
        entityId: updatedRecord.id,
        metadata: {
          vehicleId: record.vehicleId,
          companyId: record.vehicle.companyId,
          title: updatedRecord.title,
          status: updatedRecord.status,
        },
      });

      await notifyCompanyOperators(tx, record.vehicle.companyId, {
        actorUserId: req.user!.id,
        action: "VEHICLE_MAINTENANCE_RESTORE_NOTIFICATION",
        entityType: SystemEntityType.MAINTENANCE,
        entityId: updatedRecord.id,
        title: "Maintenance restored",
        message: `${updatedRecord.title} returned to active maintenance records.`,
        priority: "LOW",
        link: `/vehicles/${record.vehicleId}?tab=maintenance`,
        sourceKey: `maintenance-restore:${updatedRecord.id}`,
        metadata: {
          vehicleId: record.vehicleId,
          companyId: record.vehicle.companyId,
          title: updatedRecord.title,
        },
      });

      return updatedRecord;
    });

    res.json({ data: restoredRecord });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/share-links", authenticate, requireManagerOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!vehicle || !canAccessCompany(req.user!, vehicle.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    const links = await prisma.vehiclePublicShareLink.findMany({
      where: {
        vehicleId: vehicle.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        label: true,
        expiresAt: true,
        revokedAt: true,
        lastAccessedAt: true,
        accessCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ data: links });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/share-links",
  authenticate,
  requireManagerOrAdmin,
  validateBody(publicVehicleShareCreateSchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          companyId: true,
          model: true,
          plate: true,
        },
      });

      if (!vehicle || !canAccessCompany(req.user!, vehicle.companyId)) {
        return res.status(404).json({
          code: "VEHICLE_NOT_FOUND",
          message: "Vehicle not found",
        });
      }

      const token = generatePublicShareToken();
      const tokenHash = hashPublicShareToken(token);
      const appUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "");
      const createdLink = await prisma.vehiclePublicShareLink.create({
        data: {
          vehicleId: vehicle.id,
          createdById: req.user!.id,
          tokenHash,
          label: req.body.label || null,
          expiresAt: req.body.expiresInDays
            ? new Date(Date.now() + req.body.expiresInDays * 24 * 60 * 60 * 1000)
            : null,
        },
        select: {
          id: true,
          label: true,
          expiresAt: true,
          revokedAt: true,
          lastAccessedAt: true,
          accessCount: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await createSystemLogFromUnknown(prisma, {
        userId: req.user!.id,
        companyId: vehicle.companyId,
        action: "PUBLIC_LINK_CREATED",
        entityType: SystemEntityType.VEHICLE,
        entityId: vehicle.id,
        metadata: {
          shareLinkId: createdLink.id,
          vehicleId: vehicle.id,
          companyId: vehicle.companyId,
          model: vehicle.model,
          plate: vehicle.plate,
          expiresAt: createdLink.expiresAt?.toISOString() ?? null,
          label: createdLink.label ?? null,
        },
      });

      res.status(201).json({
        data: {
          ...createdLink,
          shareUrl: `${appUrl}/public/vehicles/${token}`,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/:id/share-links/:shareLinkId/revoke", authenticate, requireManagerOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!vehicle || !canAccessCompany(req.user!, vehicle.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    const result = await prisma.vehiclePublicShareLink.updateMany({
      where: {
        id: req.params.shareLinkId,
        vehicleId: vehicle.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return res.status(404).json({
        code: "PUBLIC_LINK_NOT_FOUND",
        message: "Public link not found",
      });
    }

    res.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      include: vehicleDetailInclude,
    });

    if (!vehicle || !canAccessCompany(req.user!, vehicle.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    res.json({ data: vehicle });
  } catch (error) {
    next(error);
  }
});

router.post("/", authenticate, requireManagerOrAdmin, validateBody(vehicleSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.body.status === "TRANSFERRED") {
      return res.status(400).json({
        code: "TRANSFER_STATUS_LOCKED",
        message: "Use the transfer endpoint to mark a vehicle as transferred",
      });
    }

    if (req.body.status === "ARCHIVED") {
      return res.status(400).json({
        code: "ARCHIVE_REQUIRES_ARCHIVE_FLOW",
        message: "Use the archive action after creating the vehicle",
      });
    }

    const companyId =
      req.user!.isPlatformAdmin && req.body.companyId ? req.body.companyId : req.user!.companyId;

    if (!(await ensureTargetCompany(companyId))) {
      return res.status(400).json({
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
      });
    }

    await assertVehicleCapacity(prisma, companyId);

    const data = normalizeVehicleData(req.body, companyId);
    const vehicle = await prisma.$transaction(async (tx) => {
      const createdVehicle = await tx.vehicle.create({ data });
      if (Array.isArray(req.body.incidents) && req.body.incidents.length > 0) {
        await syncVehicleIncidents(tx, createdVehicle.id, companyId, req.user!.id, req.body.incidents, []);
      }

      const incidentHistorySnapshot = Array.isArray(req.body.incidents)
        ? req.body.incidents.map((incident: Record<string, any>) => ({
            ...incident,
            repairedAt: incident.repairedAt || null,
            repairNotes: incident.repairNotes || null,
          }))
        : [];

      await createHistory(
        tx,
        createdVehicle.id,
        ActionType.CREATE,
        req.user!.id,
        null,
        toHistoryJson(buildVehicleHistorySnapshot(data, incidentHistorySnapshot)),
      );
      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        action: "VEHICLE_CREATE",
        entityType: SystemEntityType.VEHICLE,
        entityId: createdVehicle.id,
        metadata: {
          companyId,
          vin: createdVehicle.vin,
          model: createdVehicle.model,
          status: createdVehicle.status,
          damageStatus: createdVehicle.damageStatus,
          incidentCount: Array.isArray(req.body.incidents) ? req.body.incidents.length : 0,
        },
      });
      return tx.vehicle.findUnique({
        where: { id: createdVehicle.id },
        include: vehicleDetailInclude,
      });
    });

    res.status(201).json({ data: vehicle });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", authenticate, requireManagerOrAdmin, validateBody(vehicleSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      include: {
        incidents: {
          orderBy: { occurredAt: "desc" },
        },
      },
    });

    if (!existing || !canAccessCompany(req.user!, existing.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    if (isArchivedVehicle(existing)) {
      return res.status(400).json({
        code: "VEHICLE_ARCHIVED",
        message: "Archived vehicles must be restored before editing",
      });
    }

    if (req.body.status === "TRANSFERRED" && existing.status !== "TRANSFERRED") {
      return res.status(400).json({
        code: "TRANSFER_STATUS_LOCKED",
        message: "Use the transfer endpoint to mark a vehicle as transferred",
      });
    }

    if (req.body.status === "ARCHIVED") {
      return res.status(400).json({
        code: "ARCHIVE_REQUIRES_ARCHIVE_FLOW",
        message: "Use the archive action to archive a vehicle",
      });
    }

    if (req.body.companyId && req.body.companyId !== existing.companyId) {
      return res.status(400).json({
        code: "TRANSFER_REQUIRED",
        message: "Use the transfer endpoint to move a vehicle between companies",
      });
    }

    const update = normalizeVehicleData(req.body, existing.companyId);
    assertVehicleStatusTransition(existing.status, update.status as VehicleStatus, {
      canArchive: false,
    });

    const vehicle = await prisma.$transaction(async (tx) => {
      const updatedVehicle = await tx.vehicle.update({
        where: { id: req.params.id },
        data: update,
      });

      await createHistory(
        tx,
        updatedVehicle.id,
        ActionType.UPDATE,
        req.user!.id,
        toHistoryJson(buildVehicleHistorySnapshot(existing, existing.incidents)),
        toHistoryJson(buildVehicleHistorySnapshot(update, existing.incidents)),
      );

      if (Array.isArray(req.body.incidents)) {
        await syncVehicleIncidents(tx, updatedVehicle.id, existing.companyId, req.user!.id, req.body.incidents, existing.incidents);
      }

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        action: "VEHICLE_UPDATE",
        entityType: SystemEntityType.VEHICLE,
        entityId: updatedVehicle.id,
        metadata: {
          companyId: existing.companyId,
          vin: existing.vin,
          previousStatus: existing.status,
          nextStatus: updatedVehicle.status,
          previousDamageStatus: existing.damageStatus,
          nextDamageStatus: updatedVehicle.damageStatus,
        },
      });

      return tx.vehicle.findUnique({
        where: { id: updatedVehicle.id },
        include: vehicleDetailInclude,
      });
    });

    res.json({ data: vehicle });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", authenticate, requireManagerOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
    });

    if (!existing || !canAccessCompany(req.user!, existing.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    await prisma.$transaction(async (tx) => {
      await archiveVehicleRecord(tx, existing, req.user!.id);
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/:id/archive", authenticate, requireManagerOrAdmin, validateBody(archiveActionSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
    });

    if (!existing || !canAccessCompany(req.user!, existing.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    const archivedVehicle = await prisma.$transaction((tx) =>
      archiveVehicleRecord(tx, existing, req.user!.id, req.body.reason),
    );

    if (!archivedVehicle) {
      return res.status(400).json({
        code: "VEHICLE_ALREADY_ARCHIVED",
        message: "Vehicle is already archived",
      });
    }

    res.json({
      data: archivedVehicle,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/restore", authenticate, requireManagerOrAdmin, validateBody(vehicleRestoreSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
    });

    if (!existing || !canAccessCompany(req.user!, existing.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    const nextStatus = getRestoreVehicleStatus(req.body.status);
    const restoredVehicle = await prisma.$transaction((tx) =>
      restoreVehicleRecord(tx, existing, req.user!.id, nextStatus),
    );

    if (!restoredVehicle) {
      return res.status(400).json({
        code: "VEHICLE_NOT_ARCHIVED",
        message: "Vehicle is not archived",
      });
    }

    res.json({
      data: restoredVehicle,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/transfer", authenticate, requirePlatformAdmin, validateBody(transferSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
    });

    if (!existing || isArchivedVehicle(existing)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    if (!(await ensureTargetCompany(req.body.companyId))) {
      return res.status(400).json({
        code: "TARGET_COMPANY_NOT_FOUND",
        message: "Target company not found",
      });
    }

    if (existing.companyId === req.body.companyId) {
      return res.status(400).json({
        code: "TRANSFER_TARGET_SAME_COMPANY",
        message: "Vehicle is already assigned to that company",
      });
    }

    await assertVehicleCapacity(prisma, req.body.companyId);

    const update: Prisma.VehicleUncheckedUpdateInput = {
      companyId: req.body.companyId,
      status: "TRANSFERRED",
    };

    const updated = await prisma.$transaction(async (tx) => {
      const transferredVehicle = await tx.vehicle.update({
        where: { id: req.params.id },
        data: update,
      });

      await createHistory(
        tx,
        existing.id,
        ActionType.TRANSFER,
        req.user!.id,
        toHistoryJson({
          companyId: existing.companyId,
          status: existing.status,
        }),
        toHistoryJson({
          companyId: req.body.companyId,
          status: "TRANSFERRED",
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        companyId: existing.companyId,
        action: "VEHICLE_TRANSFER",
        entityType: SystemEntityType.VEHICLE,
        entityId: existing.id,
        metadata: {
          vin: existing.vin,
          model: existing.model,
          fromCompanyId: existing.companyId,
          toCompanyId: req.body.companyId,
          previousStatus: existing.status,
          nextStatus: "TRANSFERRED",
        },
      });

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        companyId: existing.companyId,
        action: "VEHICLE_TRANSFER_OUT",
        entityType: SystemEntityType.VEHICLE,
        entityId: existing.id,
        metadata: {
          companyId: existing.companyId,
          toCompanyId: req.body.companyId,
          model: existing.model,
        },
      });

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        companyId: req.body.companyId,
        action: "VEHICLE_TRANSFER_IN",
        entityType: SystemEntityType.VEHICLE,
        entityId: existing.id,
        metadata: {
          companyId: req.body.companyId,
          fromCompanyId: existing.companyId,
          model: existing.model,
        },
      });

      await notifyCompanyOperators(tx, existing.companyId, {
        actorUserId: req.user!.id,
        action: "VEHICLE_TRANSFER_NOTIFICATION",
        entityType: SystemEntityType.VEHICLE,
        entityId: existing.id,
        title: "Vehicle transferred",
        message: `${existing.model} left the current company scope.`,
        priority: "MEDIUM",
        link: `/vehicles/${existing.id}`,
        sourceKey: `vehicle-transfer:${existing.id}:from:${existing.companyId}:to:${req.body.companyId}`,
        metadata: {
          vehicleId: existing.id,
          model: existing.model,
          companyId: existing.companyId,
          fromCompanyId: existing.companyId,
          toCompanyId: req.body.companyId,
        },
      });

      await notifyCompanyOperators(tx, req.body.companyId, {
        actorUserId: req.user!.id,
        action: "VEHICLE_TRANSFER_NOTIFICATION",
        entityType: SystemEntityType.VEHICLE,
        entityId: existing.id,
        title: "Vehicle transferred",
        message: `${existing.model} entered the current company scope.`,
        priority: "MEDIUM",
        link: `/vehicles/${existing.id}`,
        sourceKey: `vehicle-transfer:${existing.id}:to:${req.body.companyId}`,
        metadata: {
          vehicleId: existing.id,
          model: existing.model,
          companyId: req.body.companyId,
          fromCompanyId: existing.companyId,
          toCompanyId: req.body.companyId,
        },
      });

      return transferredVehicle;
    });

    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", authenticate, requireManagerOrAdmin, validateBody(statusSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
    });

    if (!existing || !canAccessCompany(req.user!, existing.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    if (isArchivedVehicle(existing)) {
      return res.status(400).json({
        code: "VEHICLE_ARCHIVED",
        message: "Archived vehicles must be restored before lifecycle updates",
      });
    }

    if (req.body.status === "TRANSFERRED" && existing.status !== "TRANSFERRED") {
      return res.status(400).json({
        code: "TRANSFER_STATUS_LOCKED",
        message: "Use the transfer endpoint to mark a vehicle as transferred",
      });
    }

    assertVehicleStatusTransition(existing.status, req.body.status as VehicleStatus, {
      canArchive: false,
    });

    const update: Prisma.VehicleUncheckedUpdateInput = { status: req.body.status };
    const vehicle = await prisma.$transaction(async (tx) => {
      const updatedVehicle = await tx.vehicle.update({
        where: { id: req.params.id },
        data: update,
      });

      await createHistory(
        tx,
        updatedVehicle.id,
        ActionType.STATUS,
        req.user!.id,
        toHistoryJson({ status: existing.status }),
        toHistoryJson({ status: req.body.status }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: req.user!.id,
        companyId: existing.companyId,
        action: "VEHICLE_STATUS_UPDATE",
        entityType: SystemEntityType.VEHICLE,
        entityId: updatedVehicle.id,
        metadata: {
          vin: existing.vin,
          model: existing.model,
          previousStatus: existing.status,
          nextStatus: req.body.status,
        },
      });

      await notifyCompanyOperators(tx, existing.companyId, {
        actorUserId: req.user!.id,
        action: "VEHICLE_STATUS_NOTIFICATION",
        entityType: SystemEntityType.VEHICLE,
        entityId: updatedVehicle.id,
        title: "Vehicle lifecycle updated",
        message: `${existing.model} moved from ${existing.status} to ${req.body.status}.`,
        priority: req.body.status === "UNDER_REPAIR" || req.body.status === "DAMAGED" ? "HIGH" : "LOW",
        link: `/vehicles/${updatedVehicle.id}`,
        sourceKey: `vehicle-status:${updatedVehicle.id}:${req.body.status}:${Date.now()}`,
        metadata: {
          vehicleId: updatedVehicle.id,
          companyId: existing.companyId,
          model: existing.model,
          previousStatus: existing.status,
          nextStatus: req.body.status,
        },
      });

      return updatedVehicle;
    });

    res.json({ data: vehicle });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/history", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
    });

    if (!vehicle || !canAccessCompany(req.user!, vehicle.companyId)) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    const history = await prisma.vehicleHistory.findMany({
      where: { vehicleId: req.params.id },
      include: {
        changedBy: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { timestamp: "desc" },
    });

    res.json({ data: history });
  } catch (error) {
    next(error);
  }
});

router.post("/upload-image", authenticate, requireManagerOrAdmin, vehicleImageUpload.single("image"), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        code: "IMAGE_REQUIRED",
        message: "No image file provided",
      });
    }

    res.json({
      data: {
        imageUrl: getPublicImageUrl(req.file),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
