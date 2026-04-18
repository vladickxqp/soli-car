import {
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  Prisma,
  PrismaClient,
  Role,
  SystemEntityType,
} from "@prisma/client";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { sendTransactionalEmail } from "./email.js";
import { getDueReminders } from "./reminders.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

interface NotificationEvent {
  userId?: string | null;
  companyId?: string | null;
  action: string;
  entityType: SystemEntityType;
  entityId?: string | null;
  recipientEmail?: string | null;
  channel: "EMAIL" | "IN_APP";
  payload?: Record<string, unknown>;
}

interface NotificationListOptions {
  status?: NotificationStatus;
  type?: NotificationType;
  priority?: NotificationPriority;
  page: number;
  pageSize: number;
}

interface NotificationScopeUser {
  id: string;
  companyId: string;
  role: Role | "USER";
  isPlatformAdmin: boolean;
}

type EffectiveRole = "ADMIN" | "MANAGER" | "VIEWER";

const shouldLogToConsole = () => (process.env.NOTIFICATION_DELIVERY_MODE ?? "log") === "log";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toJson = (value: unknown): Prisma.InputJsonValue | null =>
  value == null ? null : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

const normalizeRole = (role: Role | "USER"): EffectiveRole => (role === "USER" ? "MANAGER" : role);

const normalizeNotificationType = (value: unknown): NotificationType => {
  switch (value) {
    case "INVITATION":
    case "SUPPORT":
    case "REMINDER":
    case "APPROVAL":
    case "VEHICLE":
    case "INCIDENT":
    case "MAINTENANCE":
    case "DOCUMENT":
    case "SYSTEM":
      return value;
    default:
      return "SYSTEM";
  }
};

const normalizeNotificationPriority = (value: unknown): NotificationPriority => {
  switch (value) {
    case "LOW":
    case "MEDIUM":
    case "HIGH":
      return value;
    default:
      return "MEDIUM";
  }
};

const inferNotificationTypeFromAction = (action: string): NotificationType => {
  if (action.startsWith("INVITATION")) return "INVITATION";
  if (action.startsWith("APPROVAL")) return "APPROVAL";
  if (action.startsWith("REMINDER")) return "REMINDER";
  if (action.startsWith("ADMIN_TICKET") || action.startsWith("TICKET")) return "SUPPORT";
  if (action.startsWith("VEHICLE_DOCUMENT") || action.startsWith("DOCUMENT")) return "DOCUMENT";
  if (action.startsWith("VEHICLE_MAINTENANCE") || action.startsWith("MAINTENANCE")) return "MAINTENANCE";
  if (action.startsWith("VEHICLE_INCIDENT") || action.startsWith("INCIDENT")) return "INCIDENT";
  if (action.startsWith("VEHICLE")) return "VEHICLE";
  return "SYSTEM";
};

const buildFallbackTitle = (action: string) => action.replace(/_/g, " ");

const buildInAppPayload = (event: NotificationEvent) => {
  const payload = event.payload ?? {};
  return {
    companyId:
      event.companyId ??
      (typeof payload.companyId === "string" ? payload.companyId : null),
    type:
      payload.notificationType != null
        ? normalizeNotificationType(payload.notificationType)
        : inferNotificationTypeFromAction(event.action),
    title:
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : buildFallbackTitle(event.action),
    message:
      typeof payload.message === "string" && payload.message.trim()
        ? payload.message.trim()
        : buildFallbackTitle(event.action),
    priority: normalizeNotificationPriority(payload.priority),
    link: typeof payload.link === "string" ? payload.link : null,
    sourceKey: typeof payload.sourceKey === "string" ? payload.sourceKey : null,
    metadata: payload,
  };
};

const createOrUpdateInAppNotification = async (
  db: DbClient,
  input: {
    userId: string;
    companyId?: string | null;
    type: NotificationType;
    title: string;
    message: string;
    priority: NotificationPriority;
    entityType?: SystemEntityType | null;
    entityId?: string | null;
    link?: string | null;
    metadata?: unknown;
    sourceKey?: string | null;
  },
) => {
  if (input.sourceKey) {
    const existing = await db.appNotification.findUnique({
      where: { sourceKey: input.sourceKey },
      select: {
        id: true,
        status: true,
        metadata: true,
      },
    });

    const existingMetadata = isRecord(existing?.metadata) ? existing.metadata : null;
    const nextMetadata = isRecord(input.metadata) ? input.metadata : null;
    const stateChanged = existingMetadata?.state !== nextMetadata?.state;
    const shouldReopen = stateChanged && existing?.status !== "UNREAD";

    if (existing) {
      return db.appNotification.update({
        where: { id: existing.id },
        data: {
          companyId: input.companyId ?? null,
          type: input.type,
          title: input.title,
          message: input.message,
          priority: input.priority,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          link: input.link ?? null,
          metadata: toJson(input.metadata) ?? Prisma.JsonNull,
          ...(shouldReopen
            ? {
                status: NotificationStatus.UNREAD,
                readAt: null,
                archivedAt: null,
              }
            : {}),
        },
      });
    }
  }

  return db.appNotification.create({
    data: {
      userId: input.userId,
      companyId: input.companyId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      priority: input.priority,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      link: input.link ?? null,
      metadata: toJson(input.metadata) ?? Prisma.JsonNull,
      sourceKey: input.sourceKey ?? null,
    },
  });
};

const emailSubjectFromPayload = (action: string, payload?: Record<string, unknown>) =>
  typeof payload?.subject === "string" ? payload.subject : action.replace(/_/g, " ");

const emailTextFromPayload = (action: string, payload?: Record<string, unknown>) => {
  const summary = Object.entries(payload ?? {})
    .filter(([key]) => !["subject", "html", "notificationType", "priority", "link", "sourceKey", "title", "message"].includes(key))
    .map(([key, value]) => `${key}: ${String(value ?? "")}`)
    .join("\n");

  return summary || action.replace(/_/g, " ");
};

export const emitNotificationEvent = async (db: DbClient, event: NotificationEvent) => {
  let deliveryMode: "smtp" | "log" | null = null;

  if (event.channel === "EMAIL" && event.recipientEmail) {
    const result = await sendTransactionalEmail({
      to: event.recipientEmail,
      subject: emailSubjectFromPayload(event.action, event.payload),
      text: emailTextFromPayload(event.action, event.payload),
      html: typeof event.payload?.html === "string" ? event.payload.html : undefined,
    });

    deliveryMode = result.mode;
  }

  if (event.channel === "IN_APP" && event.userId) {
    const payload = buildInAppPayload(event);
    await createOrUpdateInAppNotification(db, {
      userId: event.userId,
      companyId: payload.companyId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      priority: payload.priority,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      link: payload.link,
      metadata: payload.metadata,
      sourceKey: payload.sourceKey,
    });
  }

  if (shouldLogToConsole()) {
    console.info(
      `[notification:${event.channel.toLowerCase()}] ${event.action} -> ${event.recipientEmail ?? event.userId ?? "workspace"}`,
      event.payload ?? {},
    );
  }

  await createSystemLogFromUnknown(db, {
    userId: event.userId,
    companyId:
      event.companyId ??
      (typeof event.payload?.companyId === "string" ? event.payload.companyId : null),
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    metadata: {
      channel: event.channel,
      recipientEmail: event.recipientEmail ?? null,
      deliveryMode,
      ...(event.payload ?? {}),
    },
  });
};

export const emitNotificationEvents = async (db: DbClient, events: NotificationEvent[]) => {
  for (const event of events) {
    await emitNotificationEvent(db, event);
  }
};

export const getCompanyNotificationRecipients = async (
  db: DbClient,
  companyId: string,
  options?: {
    minimumRole?: Role;
    includePlatformAdmins?: boolean;
    excludeUserIds?: string[];
  },
) => {
  const minimumRole = options?.minimumRole ?? "MANAGER";
  const allowedRoles: Role[] =
    minimumRole === "ADMIN"
      ? ["ADMIN"]
      : minimumRole === "MANAGER"
        ? ["ADMIN", "MANAGER"]
        : ["ADMIN", "MANAGER", "VIEWER"];

  const users = await db.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        {
          companyId,
          role: { in: allowedRoles },
        },
        ...(options?.includePlatformAdmins
          ? [
              {
                isPlatformAdmin: true,
              },
            ]
          : []),
      ],
      ...(options?.excludeUserIds?.length
        ? {
            id: {
              notIn: options.excludeUserIds,
            },
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      companyId: true,
      role: true,
      isPlatformAdmin: true,
    },
  });

  const deduped = new Map(users.map((user) => [user.id, user]));
  return Array.from(deduped.values());
};

export const getPlatformAdminRecipients = async (
  db: DbClient,
  excludeUserIds: string[] = [],
) =>
  db.user.findMany({
    where: {
      deletedAt: null,
      isPlatformAdmin: true,
      ...(excludeUserIds.length
        ? {
            id: {
              notIn: excludeUserIds,
            },
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      companyId: true,
      role: true,
      isPlatformAdmin: true,
    },
  });

const buildReminderSourceKey = (
  userId: string,
  reminder: {
    type: string;
    state: string;
    vehicle: { id: string };
    dueDate: string;
  },
) =>
  `REMINDER:${userId}:${reminder.type}:${reminder.vehicle.id}:${reminder.state}:${reminder.dueDate.slice(0, 10)}`;

export const syncReminderNotifications = async (db: DbClient, user: NotificationScopeUser) => {
  const reminders = await getDueReminders(
    db,
    {
      companyId: user.companyId,
      role: normalizeRole(user.role),
      isPlatformAdmin: user.isPlatformAdmin,
    },
    {},
  );

  for (const reminder of reminders.slice(0, 50)) {
    const priority: NotificationPriority =
      reminder.state === "OVERDUE" ? "HIGH" : reminder.state === "DUE" ? "MEDIUM" : "LOW";

    await createOrUpdateInAppNotification(db, {
      userId: user.id,
      companyId: reminder.vehicle.companyId,
      type: "REMINDER",
      title: reminder.title,
      message: `${reminder.vehicle.model} / ${reminder.vehicle.plate}`,
      priority,
      entityType: SystemEntityType.VEHICLE,
      entityId: reminder.vehicle.id,
      link: `/vehicles/${reminder.vehicle.id}`,
      sourceKey: buildReminderSourceKey(user.id, reminder),
      metadata: {
        reminderType: reminder.type,
        state: reminder.state,
        dueDate: reminder.dueDate,
        daysRemaining: reminder.daysRemaining,
        vehicleId: reminder.vehicle.id,
        companyId: reminder.vehicle.companyId,
      },
    });
  }
};

export const listInAppNotifications = async (
  db: DbClient,
  user: NotificationScopeUser,
  options: NotificationListOptions,
) => {
  await syncReminderNotifications(db, user);

  const where: Prisma.AppNotificationWhereInput = {
    userId: user.id,
    ...(options.status
      ? {
          status: options.status,
        }
      : {
          status: {
            not: NotificationStatus.ARCHIVED,
          },
        }),
    ...(options.type ? { type: options.type } : {}),
    ...(options.priority ? { priority: options.priority } : {}),
  };

  const [total, items, unreadCount] = await Promise.all([
    db.appNotification.count({ where }),
    db.appNotification.findMany({
      where,
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    db.appNotification.count({
      where: {
        userId: user.id,
        status: NotificationStatus.UNREAD,
      },
    }),
  ]);

  return {
    total,
    items,
    unreadCount,
  };
};

export const getNotificationSummary = async (db: DbClient, user: NotificationScopeUser) => {
  await syncReminderNotifications(db, user);

  const [unreadCount, highPriorityUnreadCount, latest] = await Promise.all([
    db.appNotification.count({
      where: {
        userId: user.id,
        status: NotificationStatus.UNREAD,
      },
    }),
    db.appNotification.count({
      where: {
        userId: user.id,
        status: NotificationStatus.UNREAD,
        priority: NotificationPriority.HIGH,
      },
    }),
    db.appNotification.findMany({
      where: {
        userId: user.id,
        status: {
          not: NotificationStatus.ARCHIVED,
        },
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),
  ]);

  return {
    unreadCount,
    highPriorityUnreadCount,
    items: latest,
  };
};

export const markNotificationRead = async (db: DbClient, userId: string, notificationId: string) =>
  db.appNotification.updateMany({
    where: {
      id: notificationId,
      userId,
      status: {
        not: NotificationStatus.ARCHIVED,
      },
    },
    data: {
      status: NotificationStatus.READ,
      readAt: new Date(),
    },
  });

export const markAllNotificationsRead = async (db: DbClient, userId: string) =>
  db.appNotification.updateMany({
    where: {
      userId,
      status: NotificationStatus.UNREAD,
    },
    data: {
      status: NotificationStatus.READ,
      readAt: new Date(),
    },
  });

export const archiveNotification = async (db: DbClient, userId: string, notificationId: string) =>
  db.appNotification.updateMany({
    where: {
      id: notificationId,
      userId,
      status: {
        not: NotificationStatus.ARCHIVED,
      },
    },
    data: {
      status: NotificationStatus.ARCHIVED,
      archivedAt: new Date(),
      readAt: new Date(),
    },
  });
