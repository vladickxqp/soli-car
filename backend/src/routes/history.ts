import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = Router();

router.get("/:id/history", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle || vehicle.companyId !== req.user!.companyId) {
      return res.status(404).json({ message: "Vehicle not found" });
    }
    const history = await prisma.vehicleHistory.findMany({
      where: { vehicleId: req.params.id },
      orderBy: { timestamp: "desc" },
      include: { changedBy: { select: { id: true, email: true } } },
    });
    res.json({ data: history });
  } catch (error) {
    next(error);
  }
});

export default router;
