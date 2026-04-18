import bcrypt from "bcrypt";
import { NextFunction, Response, Router } from "express";
import { ApprovalAction, SystemEntityType } from "@prisma/client";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate, requirePlatformAdmin } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  adminUserCreateSchema,
  adminUserResetPasswordSchema,
  adminUsersQuerySchema,
  adminUserUpdateSchema,
} from "../validation/schemas.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { getPaginationMeta } from "../utils/pagination.js";
import { createApprovalRequest, isApprovalFlowEnabled } from "../services/approvals.js";

const router = Router();

const getActivePlatformAdminCount = () =>
  prisma.user.count({
    where: {
      isPlatformAdmin: true,
      deletedAt: null,
    },
  });

router.use(authenticate, requirePlatformAdmin);

router.get("/", validateQuery(adminUsersQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { search, role, companyId, page, pageSize } = req.query as unknown as {
      search?: string;
      role?: "ADMIN" | "MANAGER" | "VIEWER";
      companyId?: string;
      page: number;
      pageSize: number;
    };

    const where = {
      deletedAt: null,
      ...(role ? { role } : {}),
      ...(companyId ? { companyId } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" as const } },
              { company: { name: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const total = await prisma.user.count({ where });
    const pagination = getPaginationMeta(page, pageSize, total);

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
        isPlatformAdmin: true,
        registrationType: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json({
      data: {
        items: users,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", validateBody(adminUserCreateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.body.companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return res.status(400).json({
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
      });
    }

    if (req.body.isPlatformAdmin && req.body.role !== "ADMIN") {
      return res.status(400).json({
        code: "PLATFORM_ADMIN_REQUIRES_ADMIN_ROLE",
        message: "Platform admin access requires the ADMIN role",
      });
    }

    if (isApprovalFlowEnabled()) {
      const approval = await createApprovalRequest(prisma, {
        companyId: req.body.companyId,
        requestedById: req.user!.id,
        action: ApprovalAction.ADMIN_USER_CREATE,
        entityType: SystemEntityType.USER,
        payload: {
          email: req.body.email,
          password: req.body.password,
          role: req.body.role,
          companyId: req.body.companyId,
          isPlatformAdmin: req.body.isPlatformAdmin,
        },
      });

      return res.status(202).json({
        data: {
          action: "approval_requested",
          approval,
        },
      });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = await prisma.user.create({
      data: {
        email: req.body.email,
        password: hashedPassword,
        role: req.body.role,
        companyId: req.body.companyId,
        isPlatformAdmin: req.body.isPlatformAdmin,
      },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
        isPlatformAdmin: true,
        registrationType: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      action: "ADMIN_USER_CREATE",
      entityType: SystemEntityType.USER,
      entityId: user.id,
      metadata: {
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        isPlatformAdmin: user.isPlatformAdmin,
      },
    });

    res.status(201).json({ data: user });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validateBody(adminUserUpdateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: req.params.id },
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
      return res.status(404).json({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    if (req.body.isPlatformAdmin && req.body.role !== "ADMIN") {
      return res.status(400).json({
        code: "PLATFORM_ADMIN_REQUIRES_ADMIN_ROLE",
        message: "Platform admin access requires the ADMIN role",
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.body.companyId },
      select: { id: true },
    });

    if (!company) {
      return res.status(400).json({
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
      });
    }

    if (
      existingUser.id === req.user!.id &&
      (req.body.role !== "ADMIN" || req.body.companyId !== existingUser.companyId || !req.body.isPlatformAdmin)
    ) {
      return res.status(400).json({
        code: "SELF_MODIFICATION_RESTRICTED",
        message: "You cannot remove your own platform admin access or change your own company from the admin panel",
      });
    }

    if (existingUser.isPlatformAdmin && !req.body.isPlatformAdmin) {
      const adminCount = await getActivePlatformAdminCount();
      if (adminCount <= 1) {
        return res.status(400).json({
          code: "LAST_ADMIN_REQUIRED",
          message: "At least one active platform admin must remain in the system",
        });
      }
    }

    if (isApprovalFlowEnabled()) {
      const approval = await createApprovalRequest(prisma, {
        companyId: req.body.companyId,
        requestedById: req.user!.id,
        action: ApprovalAction.ADMIN_USER_UPDATE,
        entityType: SystemEntityType.USER,
        entityId: existingUser.id,
        payload: {
          userId: existingUser.id,
          email: req.body.email,
          role: req.body.role,
          companyId: req.body.companyId,
          isPlatformAdmin: req.body.isPlatformAdmin,
        },
      });

      return res.status(202).json({
        data: {
          action: "approval_requested",
          approval,
        },
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        email: req.body.email,
        role: req.body.role,
        companyId: req.body.companyId,
        isPlatformAdmin: req.body.isPlatformAdmin,
      },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
        isPlatformAdmin: true,
        registrationType: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
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
      },
    });

    if (existingUser.role !== updatedUser.role) {
      await createSystemLogFromUnknown(prisma, {
        userId: req.user!.id,
        action: "USER_ROLE_CHANGE",
        entityType: SystemEntityType.USER,
        entityId: updatedUser.id,
        metadata: {
          previousRole: existingUser.role,
          nextRole: updatedUser.role,
        },
      });
    }

    res.json({ data: updatedUser });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/reset-password", validateBody(adminUserResetPasswordSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        deletedAt: true,
      },
    });

    if (!existingUser || existingUser.deletedAt) {
      return res.status(404).json({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    if (isApprovalFlowEnabled()) {
      const approval = await createApprovalRequest(prisma, {
        companyId: req.user!.companyId,
        requestedById: req.user!.id,
        action: ApprovalAction.ADMIN_USER_PASSWORD_RESET,
        entityType: SystemEntityType.USER,
        entityId: existingUser.id,
        payload: {
          userId: existingUser.id,
          password: req.body.password,
        },
      });

      return res.status(202).json({
        data: {
          action: "approval_requested",
          approval,
        },
      });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { password: hashedPassword },
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      action: "ADMIN_USER_PASSWORD_RESET",
      entityType: SystemEntityType.USER,
      entityId: existingUser.id,
      metadata: {
        email: existingUser.email,
      },
    });

    res.json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: req.params.id },
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
      return res.status(404).json({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    if (existingUser.id === req.user!.id) {
      return res.status(400).json({
        code: "SELF_MODIFICATION_RESTRICTED",
        message: "You cannot delete your own admin account from the admin panel",
      });
    }

    if (existingUser.isPlatformAdmin) {
      const adminCount = await getActivePlatformAdminCount();
      if (adminCount <= 1) {
        return res.status(400).json({
          code: "LAST_ADMIN_REQUIRED",
          message: "At least one active platform admin must remain in the system",
        });
      }
    }

    if (isApprovalFlowEnabled()) {
      const approval = await createApprovalRequest(prisma, {
        companyId: existingUser.companyId,
        requestedById: req.user!.id,
        action: ApprovalAction.ADMIN_USER_DELETE,
        entityType: SystemEntityType.USER,
        entityId: existingUser.id,
        payload: {
          userId: existingUser.id,
        },
      });

      return res.status(202).json({
        data: {
          action: "approval_requested",
          approval,
        },
      });
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data: {
        deletedAt: new Date(),
      },
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      action: "ADMIN_USER_DELETE",
      entityType: SystemEntityType.USER,
      entityId: existingUser.id,
      metadata: {
        email: existingUser.email,
        role: existingUser.role,
        companyId: existingUser.companyId,
        isPlatformAdmin: existingUser.isPlatformAdmin,
      },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
