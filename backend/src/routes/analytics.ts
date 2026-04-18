import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import { analyticsQuerySchema } from "../validation/schemas.js";
import { getAdvancedAnalytics } from "../services/analytics.js";

const router = Router();

router.get("/", authenticate, validateQuery(analyticsQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { companyId } = req.query as unknown as { companyId?: string };

    const data = await getAdvancedAnalytics(
      prisma,
      {
        role: req.user!.role,
        companyId: req.user!.companyId,
        isPlatformAdmin: req.user!.isPlatformAdmin,
      },
      req.user!.isPlatformAdmin ? companyId : undefined,
    );

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

export default router;
