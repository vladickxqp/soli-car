import { Prisma, PrismaClient, Role, SystemEntityType } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

interface ActivityScope {
  companyId: string;
  role: Role | "USER";
  isPlatformAdmin: boolean;
}

interface ActivityFilters {
  companyId?: string;
  entityType?: SystemEntityType;
  userId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

const RELEVANT_ACTIONS = [
  "INVITATION_CREATE",
  "INVITATION_ACCEPTED",
  "INVITATION_REVOKE",
  "TICKET_CREATE",
  "TICKET_MESSAGE_CREATE",
  "ADMIN_TICKET_REPLY",
  "TICKET_STATUS_CHANGE",
  "ADMIN_TICKET_UPDATE",
  "VEHICLE_CREATE",
  "VEHICLE_UPDATE",
  "VEHICLE_TRANSFER",
  "VEHICLE_TRANSFER_IN",
  "VEHICLE_TRANSFER_OUT",
  "VEHICLE_STATUS_UPDATE",
  "VEHICLE_ARCHIVE",
  "VEHICLE_RESTORE",
  "VEHICLE_INCIDENT_CREATE",
  "VEHICLE_INCIDENT_UPDATE",
  "VEHICLE_DOCUMENT_UPLOAD",
  "VEHICLE_DOCUMENT_ARCHIVE",
  "VEHICLE_DOCUMENT_RESTORE",
  "INCIDENT_ATTACHMENT_UPLOAD",
  "INCIDENT_ATTACHMENT_ARCHIVE",
  "INCIDENT_ATTACHMENT_RESTORE",
  "VEHICLE_MAINTENANCE_CREATE",
  "VEHICLE_MAINTENANCE_UPDATE",
  "VEHICLE_MAINTENANCE_ARCHIVE",
  "VEHICLE_MAINTENANCE_RESTORE",
  "VEHICLE_MAINTENANCE_COMPLETE",
  "APPROVAL_REQUEST_CREATE",
  "APPROVAL_REQUEST_APPROVE",
  "APPROVAL_REQUEST_REJECT",
  "APP_NOTIFICATION_CREATE",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toDate = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const entityLink = (entry: {
  entityType: SystemEntityType;
  entityId: string | null;
  metadata?: unknown;
}) => {
  const metadata = isRecord(entry.metadata) ? entry.metadata : {};
  const vehicleId =
    typeof metadata.vehicleId === "string"
      ? metadata.vehicleId
      : entry.entityType === "VEHICLE"
        ? entry.entityId
        : null;

  if (vehicleId) {
    return `/vehicles/${vehicleId}`;
  }

  if (entry.entityType === "TICKET") {
    return "/support";
  }

  if (entry.entityType === "INVITATION") {
    return "/companies";
  }

  if (entry.entityType === "APPROVAL") {
    return "/admin/approvals";
  }

  return null;
};

const activitySummary = (entry: {
  action: string;
  entityType: SystemEntityType;
  metadata?: unknown;
}) => {
  const metadata = isRecord(entry.metadata) ? entry.metadata : {};
  const model = typeof metadata.model === "string" ? metadata.model : null;
  const title = typeof metadata.title === "string" ? metadata.title : null;
  const email = typeof metadata.email === "string" ? metadata.email : null;
  const companyName = typeof metadata.companyName === "string" ? metadata.companyName : null;
  const fromCompanyId = typeof metadata.fromCompanyId === "string" ? metadata.fromCompanyId : null;
  const toCompanyId = typeof metadata.toCompanyId === "string" ? metadata.toCompanyId : null;

  switch (entry.action) {
    case "INVITATION_CREATE":
      return {
        title: "Invitation created",
        description: email ? `Invitation prepared for ${email}${companyName ? ` in ${companyName}` : ""}.` : "A workspace invitation was created.",
      };
    case "INVITATION_ACCEPTED":
      return {
        title: "Invitation accepted",
        description: email ? `${email} joined the workspace.` : "A workspace invitation was accepted.",
      };
    case "INVITATION_REVOKE":
      return {
        title: "Invitation revoked",
        description: email ? `Invitation for ${email} was revoked.` : "A workspace invitation was revoked.",
      };
    case "TICKET_CREATE":
      return {
        title: "Support ticket opened",
        description: title ? `${title}` : "A support ticket was created.",
      };
    case "TICKET_MESSAGE_CREATE":
      return {
        title: "Support ticket updated",
        description: "A new customer reply was added to a support thread.",
      };
    case "ADMIN_TICKET_REPLY":
      return {
        title: "Support replied",
        description: "An admin replied in the support thread.",
      };
    case "TICKET_STATUS_CHANGE":
    case "ADMIN_TICKET_UPDATE":
      return {
        title: "Support ticket changed",
        description:
          typeof metadata.nextStatus === "string"
            ? `Ticket status changed to ${metadata.nextStatus}.`
            : "A support ticket was updated.",
      };
    case "VEHICLE_CREATE":
      return {
        title: "Vehicle created",
        description: model ? `${model} was added to the fleet.` : "A new vehicle was created.",
      };
    case "VEHICLE_UPDATE":
      return {
        title: "Vehicle updated",
        description: model ? `${model} details were updated.` : "A vehicle record was updated.",
      };
    case "VEHICLE_TRANSFER":
    case "VEHICLE_TRANSFER_IN":
    case "VEHICLE_TRANSFER_OUT":
      return {
        title: "Vehicle transferred",
        description:
          model || fromCompanyId || toCompanyId
            ? `${model ?? "Vehicle"} moved${fromCompanyId || toCompanyId ? ` (${fromCompanyId ?? "?"} -> ${toCompanyId ?? "?"})` : ""}.`
            : "A vehicle transfer was completed.",
      };
    case "VEHICLE_STATUS_UPDATE":
      return {
        title: "Vehicle lifecycle updated",
        description:
          typeof metadata.nextStatus === "string"
            ? `${model ?? "Vehicle"} is now ${metadata.nextStatus}.`
            : "A vehicle lifecycle status changed.",
      };
    case "VEHICLE_ARCHIVE":
      return {
        title: "Vehicle archived",
        description: model ? `${model} was moved to archive.` : "A vehicle was archived.",
      };
    case "VEHICLE_RESTORE":
      return {
        title: "Vehicle restored",
        description: model ? `${model} returned to active operations.` : "A vehicle was restored.",
      };
    case "VEHICLE_INCIDENT_CREATE":
      return {
        title: "Incident added",
        description: title ? `${title} was added to the vehicle incident log.` : "A new vehicle incident was added.",
      };
    case "VEHICLE_INCIDENT_UPDATE":
      return {
        title: "Incident updated",
        description: title ? `${title} was updated.` : "A vehicle incident was updated.",
      };
    case "VEHICLE_DOCUMENT_UPLOAD":
      return {
        title: "Document uploaded",
        description: title ? `${title} was uploaded.` : "A vehicle document was uploaded.",
      };
    case "VEHICLE_DOCUMENT_ARCHIVE":
      return {
        title: "Document archived",
        description: title ? `${title} moved to archive.` : "A vehicle document was archived.",
      };
    case "VEHICLE_DOCUMENT_RESTORE":
      return {
        title: "Document restored",
        description: title ? `${title} returned to active records.` : "A vehicle document was restored.",
      };
    case "INCIDENT_ATTACHMENT_UPLOAD":
      return {
        title: "Incident attachment uploaded",
        description: title ? `${title} was attached to an incident.` : "A new incident attachment was uploaded.",
      };
    case "INCIDENT_ATTACHMENT_ARCHIVE":
      return {
        title: "Incident attachment archived",
        description: title ? `${title} was archived.` : "An incident attachment was archived.",
      };
    case "INCIDENT_ATTACHMENT_RESTORE":
      return {
        title: "Incident attachment restored",
        description: title ? `${title} was restored.` : "An incident attachment was restored.",
      };
    case "VEHICLE_MAINTENANCE_CREATE":
      return {
        title: "Maintenance created",
        description: title ? `${title} was scheduled.` : "A maintenance event was created.",
      };
    case "VEHICLE_MAINTENANCE_UPDATE":
      return {
        title: "Maintenance updated",
        description: title ? `${title} was updated.` : "A maintenance event was updated.",
      };
    case "VEHICLE_MAINTENANCE_ARCHIVE":
      return {
        title: "Maintenance archived",
        description: title ? `${title} moved to archive.` : "A maintenance record was archived.",
      };
    case "VEHICLE_MAINTENANCE_RESTORE":
      return {
        title: "Maintenance restored",
        description: title ? `${title} returned to active records.` : "A maintenance record was restored.",
      };
    case "VEHICLE_MAINTENANCE_COMPLETE":
      return {
        title: "Maintenance completed",
        description: title ? `${title} was completed.` : "A maintenance record was completed.",
      };
    case "APPROVAL_REQUEST_CREATE":
      return {
        title: "Approval requested",
        description: "A sensitive admin action is waiting for approval.",
      };
    case "APPROVAL_REQUEST_APPROVE":
      return {
        title: "Approval completed",
        description: "A pending approval was approved and executed.",
      };
    case "APPROVAL_REQUEST_REJECT":
      return {
        title: "Approval rejected",
        description: "A pending approval was rejected.",
      };
    default:
      return {
        title: entry.action.replace(/_/g, " "),
        description: "Recent operational activity.",
      };
  }
};

export const listActivityFeed = async (db: DbClient, scope: ActivityScope, filters: ActivityFilters) => {
  const dateFrom = toDate(filters.dateFrom);
  const dateTo = toDate(filters.dateTo);
  const resolvedCompanyId = scope.isPlatformAdmin ? filters.companyId : scope.companyId;

  const where: Prisma.SystemLogWhereInput = {
    action: { in: [...RELEVANT_ACTIONS] },
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(dateFrom || dateTo
      ? {
          timestamp: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
    ...(resolvedCompanyId
      ? {
          OR: [
            { companyId: resolvedCompanyId },
            {
              companyId: null,
              user: {
                companyId: resolvedCompanyId,
                deletedAt: null,
              },
            },
          ],
        }
      : {}),
  };

  const rawLogs = await db.systemLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          companyId: true,
        },
      },
    },
    orderBy: { timestamp: "desc" },
    take: Math.max(filters.page * filters.pageSize * 3, 60),
  });

  const search = filters.search?.trim().toLowerCase();

  const items = rawLogs
    .map((entry) => {
      const summary = activitySummary(entry);
      const haystack = [
        entry.action,
        summary.title,
        summary.description,
        entry.entityId ?? "",
        entry.user?.email ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (search && !haystack.includes(search)) {
        return null;
      }

      return {
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        companyId: entry.companyId ?? entry.user?.companyId ?? null,
        title: summary.title,
        description: summary.description,
        link: entityLink(entry),
        timestamp: entry.timestamp,
        actor: entry.user
          ? {
              id: entry.user.id,
              email: entry.user.email,
            }
          : null,
      };
    })
    .filter(Boolean);

  const total = items.length;
  const start = (filters.page - 1) * filters.pageSize;
  const pagedItems = items.slice(start, start + filters.pageSize);

  return {
    total,
    items: pagedItems,
  };
};
