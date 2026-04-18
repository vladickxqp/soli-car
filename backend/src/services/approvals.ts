import bcrypt from "bcrypt";
import {
  ActionType,
  ApprovalAction,
  ApprovalRequest,
  ApprovalStatus,
  Prisma,
  PrismaClient,
  SystemEntityType,
} from "@prisma/client";
import { assertVehicleCapacity } from "./billing.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { createAppError } from "../utils/httpError.js";
import { emitNotificationEvent, emitNotificationEvents, getPlatformAdminRecipients } from "./notifications.js";

type DbClient = PrismaClient | Prisma.TransactionClient;
type RootDbClient = PrismaClient;

interface ApprovalCreationInput {
  companyId?: string | null;
  requestedById: string;
  action: ApprovalAction;
  entityType: SystemEntityType;
  entityId?: string | null;
  payload: Prisma.InputJsonValue;
  reason?: string;
}

const APPROVAL_SELECT = {
  id: true,
  companyId: true,
  requestedById: true,
  reviewedById: true,
  action: true,
  status: true,
  entityType: true,
  entityId: true,
  payload: true,
  reason: true,
  reviewComment: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  company: {
    select: {
      id: true,
      name: true,
    },
  },
  requestedBy: {
    select: {
      id: true,
      email: true,
    },
  },
  reviewedBy: {
    select: {
      id: true,
      email: true,
    },
  },
} satisfies Prisma.ApprovalRequestSelect;

const approvalsEnabled = () => (process.env.APPROVAL_FLOW_ENABLED ?? "true") !== "false";

const toHistoryJson = (value: unknown): Prisma.InputJsonValue | null =>
  value == null ? null : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

const createVehicleHistory = async (
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

const assertPlatformAdminRole = (payload: { role?: string; isPlatformAdmin?: boolean }) => {
  if (payload.isPlatformAdmin && payload.role !== "ADMIN") {
    throw createAppError(
      400,
      "PLATFORM_ADMIN_REQUIRES_ADMIN_ROLE",
      "Platform admin access requires the ADMIN role",
    );
  }
};

const getActivePlatformAdminCount = (db: DbClient) =>
  db.user.count({
    where: {
      isPlatformAdmin: true,
      deletedAt: null,
    },
  });

const executeApprovalAction = async (
  tx: Prisma.TransactionClient,
  approval: Pick<ApprovalRequest, "action" | "payload" | "entityId" | "companyId"> & { id: string },
  reviewedById: string,
) => {
  const payload = approval.payload as Record<string, unknown>;

  switch (approval.action) {
    case "ADMIN_USER_CREATE": {
      assertPlatformAdminRole({
        role: String(payload.role ?? ""),
        isPlatformAdmin: Boolean(payload.isPlatformAdmin),
      });

      const company = await tx.company.findUnique({
        where: { id: String(payload.companyId ?? "") },
        select: { id: true },
      });

      if (!company) {
        throw createAppError(400, "COMPANY_NOT_FOUND", "Company not found");
      }

      const existingUser = await tx.user.findUnique({
        where: { email: String(payload.email ?? "") },
        select: { id: true, deletedAt: true },
      });

      if (existingUser && !existingUser.deletedAt) {
        throw createAppError(409, "EMAIL_ALREADY_REGISTERED", "Email already registered");
      }

      const user = await tx.user.create({
        data: {
          email: String(payload.email ?? ""),
          password: await bcrypt.hash(String(payload.password ?? ""), 10),
          role: String(payload.role ?? "VIEWER") as Prisma.UserCreateInput["role"],
          companyId: String(payload.companyId ?? ""),
          isPlatformAdmin: Boolean(payload.isPlatformAdmin),
        },
      });

      await createSystemLogFromUnknown(tx, {
        userId: reviewedById,
        action: "ADMIN_USER_CREATE",
        entityType: SystemEntityType.USER,
        entityId: user.id,
        metadata: {
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          isPlatformAdmin: user.isPlatformAdmin,
          approvalId: approval.id,
        },
      });

      return {
        entityType: SystemEntityType.USER,
        entityId: user.id,
      };
    }

    case "ADMIN_USER_UPDATE": {
      assertPlatformAdminRole({
        role: String(payload.role ?? ""),
        isPlatformAdmin: Boolean(payload.isPlatformAdmin),
      });

      const targetUserId = String(payload.userId ?? approval.entityId ?? "");
      const existingUser = await tx.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          email: true,
          role: true,
          companyId: true,
          isPlatformAdmin: true,
          deletedAt: true,
        },
      });

      if (!existingUser || existingUser.deletedAt) {
        throw createAppError(404, "USER_NOT_FOUND", "User not found");
      }

      const company = await tx.company.findUnique({
        where: { id: String(payload.companyId ?? "") },
        select: { id: true },
      });

      if (!company) {
        throw createAppError(400, "COMPANY_NOT_FOUND", "Company not found");
      }

      if (existingUser.isPlatformAdmin && !Boolean(payload.isPlatformAdmin)) {
        const adminCount = await getActivePlatformAdminCount(tx);
        if (adminCount <= 1) {
          throw createAppError(
            400,
            "LAST_ADMIN_REQUIRED",
            "At least one active platform admin must remain in the system",
          );
        }
      }

      const updatedUser = await tx.user.update({
        where: { id: existingUser.id },
        data: {
          email: String(payload.email ?? ""),
          role: String(payload.role ?? "VIEWER") as Prisma.UserUpdateInput["role"],
          companyId: String(payload.companyId ?? ""),
          isPlatformAdmin: Boolean(payload.isPlatformAdmin),
        },
      });

      await createSystemLogFromUnknown(tx, {
        userId: reviewedById,
        action: "ADMIN_USER_UPDATE",
        entityType: SystemEntityType.USER,
        entityId: updatedUser.id,
        metadata: {
          previousEmail: existingUser.email,
          nextEmail: updatedUser.email,
          previousRole: existingUser.role,
          nextRole: updatedUser.role,
          previousCompanyId: existingUser.companyId,
          nextCompanyId: updatedUser.companyId,
          previousPlatformAdmin: existingUser.isPlatformAdmin,
          nextPlatformAdmin: updatedUser.isPlatformAdmin,
          approvalId: approval.id,
        },
      });

      return {
        entityType: SystemEntityType.USER,
        entityId: updatedUser.id,
      };
    }

    case "ADMIN_USER_PASSWORD_RESET": {
      const targetUserId = String(payload.userId ?? approval.entityId ?? "");
      const existingUser = await tx.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          email: true,
          deletedAt: true,
        },
      });

      if (!existingUser || existingUser.deletedAt) {
        throw createAppError(404, "USER_NOT_FOUND", "User not found");
      }

      await tx.user.update({
        where: { id: existingUser.id },
        data: {
          password: await bcrypt.hash(String(payload.password ?? ""), 10),
        },
      });

      await createSystemLogFromUnknown(tx, {
        userId: reviewedById,
        action: "ADMIN_USER_PASSWORD_RESET",
        entityType: SystemEntityType.USER,
        entityId: existingUser.id,
        metadata: {
          email: existingUser.email,
          approvalId: approval.id,
        },
      });

      return {
        entityType: SystemEntityType.USER,
        entityId: existingUser.id,
      };
    }

    case "ADMIN_USER_DELETE": {
      const targetUserId = String(payload.userId ?? approval.entityId ?? "");
      const existingUser = await tx.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          email: true,
          role: true,
          companyId: true,
          isPlatformAdmin: true,
          deletedAt: true,
        },
      });

      if (!existingUser || existingUser.deletedAt) {
        throw createAppError(404, "USER_NOT_FOUND", "User not found");
      }

      if (existingUser.isPlatformAdmin) {
        const adminCount = await getActivePlatformAdminCount(tx);
        if (adminCount <= 1) {
          throw createAppError(
            400,
            "LAST_ADMIN_REQUIRED",
            "At least one active platform admin must remain in the system",
          );
        }
      }

      await tx.user.update({
        where: { id: existingUser.id },
        data: {
          deletedAt: new Date(),
        },
      });

      await createSystemLogFromUnknown(tx, {
        userId: reviewedById,
        action: "ADMIN_USER_DELETE",
        entityType: SystemEntityType.USER,
        entityId: existingUser.id,
        metadata: {
          email: existingUser.email,
          role: existingUser.role,
          companyId: existingUser.companyId,
          isPlatformAdmin: existingUser.isPlatformAdmin,
          approvalId: approval.id,
        },
      });

      return {
        entityType: SystemEntityType.USER,
        entityId: existingUser.id,
      };
    }

    case "ADMIN_COMPANY_DELETE": {
      const targetCompanyId = String(payload.companyId ?? approval.entityId ?? "");
      const company = await tx.company.findUnique({
        where: { id: targetCompanyId },
        select: {
          id: true,
          name: true,
          users: {
            where: { deletedAt: null },
            select: { id: true },
          },
          vehicles: {
            where: { deletedAt: null },
            select: { id: true },
          },
          tickets: {
            select: { id: true },
          },
        },
      });

      if (!company) {
        throw createAppError(404, "COMPANY_NOT_FOUND", "Company not found");
      }

      if (company.users.length > 0 || company.vehicles.length > 0 || company.tickets.length > 0) {
        throw createAppError(
          400,
          "COMPANY_NOT_EMPTY",
          "Delete or reassign all active users, vehicles, and tickets before deleting this company",
        );
      }

      await tx.company.delete({
        where: { id: company.id },
      });

      await createSystemLogFromUnknown(tx, {
        userId: reviewedById,
        action: "ADMIN_COMPANY_DELETE",
        entityType: SystemEntityType.COMPANY,
        entityId: company.id,
        metadata: {
          name: company.name,
          approvalId: approval.id,
        },
      });

      return {
        entityType: SystemEntityType.COMPANY,
        entityId: company.id,
      };
    }

    case "ADMIN_VEHICLE_TRANSFER": {
      const vehicleId = String(payload.vehicleId ?? approval.entityId ?? "");
      const targetCompanyId = String(payload.targetCompanyId ?? payload.companyId ?? "");
      const vehicle = await tx.vehicle.findUnique({
        where: { id: vehicleId },
      });

      if (!vehicle || vehicle.deletedAt || (vehicle as { archivedAt?: Date | null }).archivedAt || vehicle.status === "ARCHIVED") {
        throw createAppError(404, "VEHICLE_NOT_FOUND", "Vehicle not found");
      }

      const company = await tx.company.findUnique({
        where: { id: targetCompanyId },
        select: { id: true },
      });

      if (!company) {
        throw createAppError(400, "TARGET_COMPANY_NOT_FOUND", "Target company not found");
      }

      if (vehicle.companyId === targetCompanyId) {
        throw createAppError(
          400,
          "TRANSFER_TARGET_SAME_COMPANY",
          "Vehicle is already assigned to that company",
        );
      }

      await assertVehicleCapacity(tx, targetCompanyId);

      const transferredVehicle = await tx.vehicle.update({
        where: { id: vehicle.id },
        data: {
          companyId: targetCompanyId,
          status: "TRANSFERRED",
        },
      });

      await createVehicleHistory(
        tx,
        vehicle.id,
        ActionType.TRANSFER,
        reviewedById,
        toHistoryJson({
          companyId: vehicle.companyId,
          status: vehicle.status,
        }),
        toHistoryJson({
          companyId: targetCompanyId,
          status: "TRANSFERRED",
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: reviewedById,
        companyId: vehicle.companyId,
        action: "VEHICLE_TRANSFER",
        entityType: SystemEntityType.VEHICLE,
        entityId: vehicle.id,
        metadata: {
          vin: vehicle.vin,
          model: vehicle.model,
          fromCompanyId: vehicle.companyId,
          toCompanyId: targetCompanyId,
          previousStatus: vehicle.status,
          nextStatus: "TRANSFERRED",
          approvalId: approval.id,
        },
      });

      return {
        entityType: SystemEntityType.VEHICLE,
        entityId: transferredVehicle.id,
      };
    }

    case "ADMIN_VEHICLE_DELETE": {
      const vehicleId = String(payload.vehicleId ?? approval.entityId ?? "");
      const vehicle = await tx.vehicle.findUnique({
        where: { id: vehicleId },
      });

      if (!vehicle || vehicle.deletedAt || (vehicle as { archivedAt?: Date | null }).archivedAt || vehicle.status === "ARCHIVED") {
        throw createAppError(404, "VEHICLE_NOT_FOUND", "Vehicle not found");
      }

      const archivedAt = new Date();
      await tx.vehicle.update({
        where: { id: vehicle.id },
        data: {
          archivedAt,
          archivedByUserId: reviewedById,
          archiveReason: "Approved admin archive flow",
          deletedAt: archivedAt,
          status: "ARCHIVED",
        },
      });

      await createVehicleHistory(
        tx,
        vehicle.id,
        ActionType.ARCHIVE,
        reviewedById,
        toHistoryJson({
          status: vehicle.status,
          archivedAt: null,
        }),
        toHistoryJson({
          status: "ARCHIVED",
          archivedAt: archivedAt.toISOString(),
        }),
      );

      await createSystemLogFromUnknown(tx, {
        userId: reviewedById,
        companyId: vehicle.companyId,
        action: "VEHICLE_ARCHIVE",
        entityType: SystemEntityType.VEHICLE,
        entityId: vehicle.id,
        metadata: {
          companyId: vehicle.companyId,
          vin: vehicle.vin,
          model: vehicle.model,
          approvalId: approval.id,
        },
      });

      return {
        entityType: SystemEntityType.VEHICLE,
        entityId: vehicle.id,
      };
    }

    default:
      throw createAppError(400, "APPROVAL_ACTION_UNSUPPORTED", "Unsupported approval action");
  }
};

export const isApprovalFlowEnabled = () => approvalsEnabled();

export const createApprovalRequest = async (db: DbClient, input: ApprovalCreationInput) => {
  if (!approvalsEnabled()) {
    throw createAppError(400, "APPROVALS_DISABLED", "Approval flow is disabled");
  }

  const approval = await db.approvalRequest.create({
    data: {
      companyId: input.companyId ?? null,
      requestedById: input.requestedById,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      payload: input.payload,
      reason: input.reason ?? null,
    },
    select: APPROVAL_SELECT,
  });

  await createSystemLogFromUnknown(db, {
    userId: input.requestedById,
    companyId: input.companyId ?? null,
    action: "APPROVAL_REQUEST_CREATE",
    entityType: SystemEntityType.APPROVAL,
    entityId: approval.id,
    metadata: {
      action: input.action,
      requestedEntityType: input.entityType,
      requestedEntityId: input.entityId ?? null,
      companyId: input.companyId ?? null,
      reason: input.reason ?? null,
    },
  });

  const admins = await getPlatformAdminRecipients(db, [input.requestedById]);
  await emitNotificationEvents(
    db,
    admins.map((admin) => ({
      userId: admin.id,
      companyId: input.companyId ?? admin.companyId,
      action: "APPROVAL_REQUEST_CREATED_NOTIFICATION",
      entityType: SystemEntityType.APPROVAL,
      entityId: approval.id,
      channel: "IN_APP" as const,
      payload: {
        notificationType: "APPROVAL",
        title: "Approval request created",
        message: `A sensitive action (${input.action}) is waiting for review.`,
        priority: "HIGH",
        link: "/admin/approvals",
        sourceKey: `approval-created:${approval.id}:${admin.id}`,
        companyId: input.companyId ?? admin.companyId,
        requestedEntityType: input.entityType,
        requestedEntityId: input.entityId ?? null,
      },
    })),
  );

  return approval;
};

export const getApprovalList = async (
  db: DbClient,
  options: {
    search?: string;
    status?: ApprovalStatus;
    action?: ApprovalAction;
    companyId?: string;
    page: number;
    pageSize: number;
  },
) => {
  const where: Prisma.ApprovalRequestWhereInput = {
    ...(options.status ? { status: options.status } : {}),
    ...(options.action ? { action: options.action } : {}),
    ...(options.companyId ? { companyId: options.companyId } : {}),
    ...(options.search
      ? {
          OR: [
            { reason: { contains: options.search, mode: "insensitive" } },
            { entityId: { contains: options.search, mode: "insensitive" } },
            { requestedBy: { email: { contains: options.search, mode: "insensitive" } } },
            { reviewedBy: { email: { contains: options.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    db.approvalRequest.count({ where }),
    db.approvalRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: APPROVAL_SELECT,
    }),
  ]);

  return {
    total,
    items,
  };
};

export const approveApprovalRequest = async (
  db: RootDbClient,
  approvalId: string,
  reviewedById: string,
  reviewComment?: string,
) =>
  db.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      throw createAppError(404, "APPROVAL_NOT_FOUND", "Approval request not found");
    }

    if (approval.status !== ApprovalStatus.PENDING) {
      throw createAppError(400, "APPROVAL_ALREADY_RESOLVED", "Approval request has already been resolved");
    }

    const executionResult = await executeApprovalAction(tx, approval, reviewedById);

    const updatedApproval = await tx.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: ApprovalStatus.APPROVED,
        reviewedById,
        reviewComment: reviewComment ?? null,
        reviewedAt: new Date(),
        entityId: executionResult.entityId ?? approval.entityId,
      },
      select: APPROVAL_SELECT,
    });

    await createSystemLogFromUnknown(tx, {
      userId: reviewedById,
      companyId: approval.companyId ?? null,
      action: "APPROVAL_REQUEST_APPROVE",
      entityType: SystemEntityType.APPROVAL,
      entityId: approval.id,
      metadata: {
        action: approval.action,
        requestedEntityType: approval.entityType,
        requestedEntityId: approval.entityId,
        executedEntityId: executionResult.entityId ?? approval.entityId,
        reviewComment: reviewComment ?? null,
      },
    });

    await emitNotificationEvent(tx, {
      userId: approval.requestedById,
      companyId: approval.companyId ?? null,
      action: "APPROVAL_REQUEST_APPROVED_NOTIFICATION",
      entityType: SystemEntityType.APPROVAL,
      entityId: approval.id,
      channel: "IN_APP",
      payload: {
        notificationType: "APPROVAL",
        title: "Approval approved",
        message: `Approval for ${approval.action} was approved and executed.`,
        priority: "MEDIUM",
        link: "/admin/approvals",
        sourceKey: `approval-approved:${approval.id}:${approval.requestedById}`,
        companyId: approval.companyId ?? null,
      },
    });

    return updatedApproval;
  });

export const rejectApprovalRequest = async (
  db: RootDbClient,
  approvalId: string,
  reviewedById: string,
  reviewComment?: string,
) =>
  db.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      throw createAppError(404, "APPROVAL_NOT_FOUND", "Approval request not found");
    }

    if (approval.status !== ApprovalStatus.PENDING) {
      throw createAppError(400, "APPROVAL_ALREADY_RESOLVED", "Approval request has already been resolved");
    }

    const updatedApproval = await tx.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: ApprovalStatus.REJECTED,
        reviewedById,
        reviewComment: reviewComment ?? null,
        reviewedAt: new Date(),
      },
      select: APPROVAL_SELECT,
    });

    await createSystemLogFromUnknown(tx, {
      userId: reviewedById,
      companyId: approval.companyId ?? null,
      action: "APPROVAL_REQUEST_REJECT",
      entityType: SystemEntityType.APPROVAL,
      entityId: approval.id,
      metadata: {
        action: approval.action,
        requestedEntityType: approval.entityType,
        requestedEntityId: approval.entityId,
        reviewComment: reviewComment ?? null,
      },
    });

    await emitNotificationEvent(tx, {
      userId: approval.requestedById,
      companyId: approval.companyId ?? null,
      action: "APPROVAL_REQUEST_REJECTED_NOTIFICATION",
      entityType: SystemEntityType.APPROVAL,
      entityId: approval.id,
      channel: "IN_APP",
      payload: {
        notificationType: "APPROVAL",
        title: "Approval rejected",
        message: `Approval for ${approval.action} was rejected.`,
        priority: "MEDIUM",
        link: "/admin/approvals",
        sourceKey: `approval-rejected:${approval.id}:${approval.requestedById}`,
        companyId: approval.companyId ?? null,
      },
    });

    return updatedApproval;
  });
