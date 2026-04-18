import { ApprovalAction, SystemEntityType } from "@prisma/client";
import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate, requirePlatformAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { transferSchema } from "../validation/schemas.js";
import { createApprovalRequest, isApprovalFlowEnabled } from "../services/approvals.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { assertVehicleCapacity } from "../services/billing.js";

const router = Router();

router.use(authenticate, requirePlatformAdmin);

router.post("/:id/transfer", validateBody(transferSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        companyId: true,
        deletedAt: true,
      },
    });

    if (!vehicle || vehicle.deletedAt) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    if (vehicle.companyId === req.body.companyId) {
      return res.status(400).json({
        code: "TRANSFER_TARGET_SAME_COMPANY",
        message: "Vehicle is already assigned to that company",
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.body.companyId },
      select: { id: true },
    });

    if (!company) {
      return res.status(400).json({
        code: "TARGET_COMPANY_NOT_FOUND",
        message: "Target company not found",
      });
    }

    if (isApprovalFlowEnabled()) {
      const approval = await createApprovalRequest(prisma, {
        companyId: req.body.companyId,
        requestedById: req.user!.id,
        action: ApprovalAction.ADMIN_VEHICLE_TRANSFER,
        entityType: SystemEntityType.VEHICLE,
        entityId: vehicle.id,
        payload: {
          vehicleId: vehicle.id,
          targetCompanyId: req.body.companyId,
        },
      });

      return res.status(202).json({
        data: {
          action: "approval_requested",
          approval,
        },
      });
    }

    await assertVehicleCapacity(prisma, req.body.companyId);
    const updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        companyId: req.body.companyId,
        status: "TRANSFERRED",
      },
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      action: "VEHICLE_TRANSFER",
      entityType: SystemEntityType.VEHICLE,
      entityId: updatedVehicle.id,
      metadata: {
        fromCompanyId: vehicle.companyId,
        toCompanyId: req.body.companyId,
      },
    });

    res.json({ data: updatedVehicle });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        companyId: true,
        deletedAt: true,
      },
    });

    if (!vehicle || vehicle.deletedAt) {
      return res.status(404).json({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle not found",
      });
    }

    if (isApprovalFlowEnabled()) {
      const approval = await createApprovalRequest(prisma, {
        companyId: vehicle.companyId,
        requestedById: req.user!.id,
        action: ApprovalAction.ADMIN_VEHICLE_DELETE,
        entityType: SystemEntityType.VEHICLE,
        entityId: vehicle.id,
        payload: {
          vehicleId: vehicle.id,
        },
      });

      return res.status(202).json({
        data: {
          action: "approval_requested",
          approval,
        },
      });
    }

    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        deletedAt: new Date(),
      },
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      action: "VEHICLE_DELETE",
      entityType: SystemEntityType.VEHICLE,
      entityId: vehicle.id,
      metadata: {
        companyId: vehicle.companyId,
      },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
