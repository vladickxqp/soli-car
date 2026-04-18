import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import { activityQuerySchema } from "../validation/schemas.js";
import { listActivityFeed } from "../services/activity.js";
import { getPaginationMeta } from "../utils/pagination.js";

const router = Router();

router.get("/", authenticate, validateQuery(activityQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { companyId, entityType, userId, search, dateFrom, dateTo, page, pageSize } = req.query as unknown as {
      companyId?: string;
      entityType?: any;
      userId?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page: number;
      pageSize: number;
    };

    const { total, items } = await listActivityFeed(
      prisma,
      {
        companyId: req.user!.companyId,
        role: req.user!.role,
        isPlatformAdmin: req.user!.isPlatformAdmin,
      },
      {
        companyId,
        entityType,
        userId,
        search,
        dateFrom,
        dateTo,
        page,
        pageSize,
      },
    );

    res.json({
      data: {
        items,
        pagination: getPaginationMeta(page, pageSize, total),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
