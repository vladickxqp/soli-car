import { NextFunction, Response, Router } from "express";
import { ApprovalAction, SystemEntityType } from "@prisma/client";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate, requirePlatformAdmin } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  adminCompaniesQuerySchema,
  adminCompanyCreateSchema,
  adminCompanyUpdateSchema,
} from "../validation/schemas.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { getPaginationMeta } from "../utils/pagination.js";
import { ensureCompanySubscription } from "../services/billing.js";
import { createApprovalRequest, isApprovalFlowEnabled } from "../services/approvals.js";

const router = Router();

router.use(authenticate, requirePlatformAdmin);

router.get("/", validateQuery(adminCompaniesQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { search, page, pageSize } = req.query as unknown as {
      search?: string;
      page: number;
      pageSize: number;
    };

    const where = search
      ? {
          name: {
            contains: search,
            mode: "insensitive" as const,
          },
        }
      : {};

    const total = await prisma.company.count({ where });
    const pagination = getPaginationMeta(page, pageSize, total);

    const companies = await prisma.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        users: {
          where: { deletedAt: null },
          select: { id: true },
        },
        vehicles: {
          where: { deletedAt: null },
          select: { id: true },
        },
        tickets: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    res.json({
      data: {
        items: companies.map((company) => ({
          id: company.id,
          name: company.name,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
          userCount: company.users.length,
          vehicleCount: company.vehicles.length,
          ticketCount: company.tickets.length,
          openTicketCount: company.tickets.filter((ticket) => ticket.status !== "CLOSED").length,
        })),
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        users: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            role: true,
            companyId: true,
            isPlatformAdmin: true,
            registrationType: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        vehicles: {
          where: { deletedAt: null },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            companyId: true,
            model: true,
            vin: true,
            plate: true,
            driver: true,
            mileage: true,
            status: true,
            hadPreviousAccidents: true,
            damageStatus: true,
            imageUrl: true,
            updatedAt: true,
            incidents: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!company) {
      return res.status(404).json({
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
      });
    }

    res.json({ data: company });
  } catch (error) {
    next(error);
  }
});

router.post("/", validateBody(adminCompanyCreateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const company = await prisma.$transaction(async (tx) => {
      const createdCompany = await tx.company.create({
        data: {
          name: req.body.name,
        },
      });

      await ensureCompanySubscription(tx, createdCompany.id, createdCompany.name);
      return createdCompany;
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      action: "ADMIN_COMPANY_CREATE",
      entityType: SystemEntityType.COMPANY,
      entityId: company.id,
      metadata: {
        name: company.name,
      },
    });

    res.status(201).json({ data: company });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validateBody(adminCompanyUpdateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existingCompany = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
      },
    });

    if (!existingCompany) {
      return res.status(404).json({
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
      });
    }

    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name,
      },
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      action: "ADMIN_COMPANY_UPDATE",
      entityType: SystemEntityType.COMPANY,
      entityId: company.id,
      metadata: {
        previousName: existingCompany.name,
        nextName: company.name,
      },
    });

    res.json({ data: company });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        users: {
          where: { deletedAt: null },
          select: { id: true },
        },
        vehicles: {
          where: { deletedAt: null },
          select: { id: true },
        },
        tickets: {
          select: { id: true },
        },
      },
    });

    if (!company) {
      return res.status(404).json({
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
      });
    }

    if (company.users.length > 0 || company.vehicles.length > 0 || company.tickets.length > 0) {
      return res.status(400).json({
        code: "COMPANY_NOT_EMPTY",
        message: "Delete or reassign all active users, vehicles, and tickets before deleting this company",
      });
    }

    if (isApprovalFlowEnabled()) {
      const approval = await createApprovalRequest(prisma, {
        companyId: company.id,
        requestedById: req.user!.id,
        action: ApprovalAction.ADMIN_COMPANY_DELETE,
        entityType: SystemEntityType.COMPANY,
        entityId: company.id,
        payload: {
          companyId: company.id,
        },
      });

      return res.status(202).json({
        data: {
          action: "approval_requested",
          approval,
        },
      });
    }

    await prisma.company.delete({
      where: { id: req.params.id },
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      action: "ADMIN_COMPANY_DELETE",
      entityType: SystemEntityType.COMPANY,
      entityId: company.id,
      metadata: {
        name: company.name,
      },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
