import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate, requirePlatformAdmin } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  approvalDecisionSchema,
  approvalsQuerySchema,
} from "../validation/schemas.js";
import {
  approveApprovalRequest,
  getApprovalList,
  rejectApprovalRequest,
} from "../services/approvals.js";
import { getPaginationMeta } from "../utils/pagination.js";

const router = Router();

router.use(authenticate, requirePlatformAdmin);

router.get("/", validateQuery(approvalsQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { search, status, action, companyId, page, pageSize } = req.query as unknown as {
      search?: string;
      status?: "PENDING" | "APPROVED" | "REJECTED";
      action?: string;
      companyId?: string;
      page: number;
      pageSize: number;
    };

    const { total, items } = await getApprovalList(prisma, {
      search,
      status: status as any,
      action: action as any,
      companyId,
      page,
      pageSize,
    });
    const pagination = getPaginationMeta(page, pageSize, total);

    res.json({
      data: {
        items,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/approve", validateBody(approvalDecisionSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const approval = await approveApprovalRequest(
      prisma,
      req.params.id,
      req.user!.id,
      req.body.reviewComment,
    );

    res.json({ data: approval });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/reject", validateBody(approvalDecisionSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const approval = await rejectApprovalRequest(
      prisma,
      req.params.id,
      req.user!.id,
      req.body.reviewComment,
    );

    res.json({ data: approval });
  } catch (error) {
    next(error);
  }
});

export default router;
