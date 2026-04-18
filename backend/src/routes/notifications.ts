import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import { notificationsQuerySchema } from "../validation/schemas.js";
import {
  archiveNotification,
  getNotificationSummary,
  listInAppNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notifications.js";
import { getPaginationMeta } from "../utils/pagination.js";

const router = Router();

router.use(authenticate);

router.get("/summary", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const summary = await getNotificationSummary(prisma, {
      id: req.user!.id,
      companyId: req.user!.companyId,
      role: req.user!.role,
      isPlatformAdmin: req.user!.isPlatformAdmin,
    });

    res.json({ data: summary });
  } catch (error) {
    next(error);
  }
});

router.get("/", validateQuery(notificationsQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, type, priority, page, pageSize } = req.query as unknown as {
      status?: "UNREAD" | "READ" | "ARCHIVED";
      type?: any;
      priority?: "LOW" | "MEDIUM" | "HIGH";
      page: number;
      pageSize: number;
    };

    const { total, items, unreadCount } = await listInAppNotifications(
      prisma,
      {
        id: req.user!.id,
        companyId: req.user!.companyId,
        role: req.user!.role,
        isPlatformAdmin: req.user!.isPlatformAdmin,
      },
      {
        status: status as any,
        type,
        priority: priority as any,
        page,
        pageSize,
      },
    );

    res.json({
      data: {
        items,
        pagination: getPaginationMeta(page, pageSize, total),
        unreadCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/read", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await markNotificationRead(prisma, req.user!.id, req.params.id);

    if (result.count === 0) {
      return res.status(404).json({
        code: "NOTIFICATION_NOT_FOUND",
        message: "Notification not found",
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

router.post("/read-all", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await markAllNotificationsRead(prisma, req.user!.id);

    res.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/archive", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await archiveNotification(prisma, req.user!.id, req.params.id);

    if (result.count === 0) {
      return res.status(404).json({
        code: "NOTIFICATION_NOT_FOUND",
        message: "Notification not found",
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

export default router;
