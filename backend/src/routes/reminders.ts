import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import { remindersQuerySchema } from "../validation/schemas.js";
import { getDueReminders } from "../services/reminders.js";

const router = Router();

router.get("/", authenticate, validateQuery(remindersQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const reminders = await getDueReminders(
      prisma,
      {
        companyId: req.user!.companyId,
        role: req.user!.role,
        isPlatformAdmin: req.user!.isPlatformAdmin,
      },
      {
        companyId: typeof req.query.companyId === "string" ? req.query.companyId : undefined,
        type: typeof req.query.type === "string" ? (req.query.type as any) : undefined,
        state: typeof req.query.state === "string" ? (req.query.state as any) : undefined,
      },
    );

    res.json({ data: reminders });
  } catch (error) {
    next(error);
  }
});

export default router;
