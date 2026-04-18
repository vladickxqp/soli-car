import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate, requirePlatformAdmin } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import { adminLogsQuerySchema } from "../validation/schemas.js";
import { getPaginationMeta } from "../utils/pagination.js";

const router = Router();

router.use(authenticate, requirePlatformAdmin);

router.get("/", validateQuery(adminLogsQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { search, entityType, action, page, pageSize } = req.query as unknown as {
      search?: string;
      entityType?: "VEHICLE" | "USER" | "COMPANY" | "TICKET" | "INVITATION" | "DOCUMENT" | "MAINTENANCE" | "APPROVAL";
      action?: string;
      page: number;
      pageSize: number;
    };

    const where = {
      ...(entityType ? { entityType } : {}),
      ...(action
        ? {
            action: {
              contains: action,
              mode: "insensitive" as const,
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                action: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                entityId: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                user: {
                  email: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const total = await prisma.systemLog.count({ where });
    const pagination = getPaginationMeta(page, pageSize, total);

    const logs = await prisma.systemLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        timestamp: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    res.json({
      data: {
        items: logs,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
