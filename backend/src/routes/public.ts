import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { getPublicImageUrl } from "../utils/vehicleFiles.js";
import { hashPublicShareToken } from "../utils/publicLinks.js";
import { SystemEntityType } from "@prisma/client";

const router = Router();

router.get("/vehicles/:token", async (req, res: Response, next: NextFunction) => {
  try {
    const tokenHash = hashPublicShareToken(req.params.token);
    const shareLink = await prisma.vehiclePublicShareLink.findUnique({
      where: { tokenHash },
      include: {
        vehicle: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
            incidents: {
              orderBy: {
                occurredAt: "desc",
              },
              include: {
                attachments: {
                  where: {
                    archivedAt: null,
                  },
                  orderBy: {
                    createdAt: "desc",
                  },
                  select: {
                    id: true,
                    title: true,
                    documentType: true,
                    originalName: true,
                    mimeType: true,
                    sizeBytes: true,
                    createdAt: true,
                  },
                },
              },
            },
            maintenanceRecords: {
              where: {
                archivedAt: null,
              },
              orderBy: [{ reminderDate: "asc" }, { createdAt: "desc" }],
              select: {
                id: true,
                title: true,
                description: true,
                status: true,
                serviceDate: true,
                completedAt: true,
                cost: true,
                vendor: true,
                mileage: true,
                reminderDate: true,
                createdAt: true,
                updatedAt: true,
              },
            },
            documents: {
              where: {
                archivedAt: null,
                incidentId: null,
              },
              orderBy: {
                createdAt: "desc",
              },
              select: {
                id: true,
                title: true,
                documentType: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                expiryDate: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!shareLink || shareLink.revokedAt || (shareLink.expiresAt && shareLink.expiresAt.getTime() < Date.now())) {
      return res.status(404).json({
        code: "PUBLIC_LINK_NOT_FOUND",
        message: "Public link not found",
      });
    }

    await prisma.vehiclePublicShareLink.update({
      where: { id: shareLink.id },
      data: {
        lastAccessedAt: new Date(),
        accessCount: {
          increment: 1,
        },
      },
    });

    await createSystemLogFromUnknown(prisma, {
      companyId: shareLink.vehicle.companyId,
      action: "PUBLIC_LINK_ACCESSED",
      entityType: SystemEntityType.VEHICLE,
      entityId: shareLink.vehicle.id,
      metadata: {
        shareLinkId: shareLink.id,
        vehicleId: shareLink.vehicle.id,
        ip: req.ip,
      },
    });

    res.json({
      data: {
        shareLink: {
          id: shareLink.id,
          label: shareLink.label,
          expiresAt: shareLink.expiresAt,
          createdAt: shareLink.createdAt,
          lastAccessedAt: shareLink.lastAccessedAt,
          accessCount: shareLink.accessCount + 1,
        },
        vehicle: {
          id: shareLink.vehicle.id,
          model: shareLink.vehicle.model,
          plate: shareLink.vehicle.plate,
          status: shareLink.vehicle.status,
          company: shareLink.vehicle.company,
          driver: shareLink.vehicle.driver,
          firstRegistration: shareLink.vehicle.firstRegistration,
          mileage: shareLink.vehicle.mileage,
          yearlyMileage: shareLink.vehicle.yearlyMileage,
          tuvDate: shareLink.vehicle.tuvDate,
          insuranceEnd: shareLink.vehicle.insuranceEnd,
          contractEnd: shareLink.vehicle.contractEnd,
          hadPreviousAccidents: shareLink.vehicle.hadPreviousAccidents,
          damageStatus: shareLink.vehicle.damageStatus,
          damageNotes: shareLink.vehicle.damageNotes,
          imageUrl: getPublicImageUrl(shareLink.vehicle.imageUrl),
          archivedAt: shareLink.vehicle.archivedAt,
          incidents: shareLink.vehicle.incidents,
          maintenanceRecords: shareLink.vehicle.maintenanceRecords,
          documents: shareLink.vehicle.documents,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
