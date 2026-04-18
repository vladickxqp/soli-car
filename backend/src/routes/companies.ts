import { InvitationStatus, SystemEntityType } from "@prisma/client";
import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate, requireAdmin } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  companyInvitationCreateSchema,
  companyInvitationsQuerySchema,
} from "../validation/schemas.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { emitNotificationEvent, emitNotificationEvents, getCompanyNotificationRecipients } from "../services/notifications.js";
import { generateInvitationToken, hashInvitationToken } from "../utils/invitations.js";

const router = Router();

const canManageCompanyScope = (user: NonNullable<AuthRequest["user"]>, companyId: string) =>
  user.isPlatformAdmin || (user.role === "ADMIN" && user.companyId === companyId);

const markExpiredInvitation = async (invitationId: string) => {
  await prisma.companyInvitation.update({
    where: { id: invitationId },
    data: { status: InvitationStatus.EXPIRED },
  });
};

const companyDetailSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  users: {
    where: { deletedAt: null },
    orderBy: [{ role: "desc" as const }, { createdAt: "asc" as const }],
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
    orderBy: { updatedAt: "desc" as const },
    select: {
      id: true,
      companyId: true,
      model: true,
      plate: true,
      vin: true,
      driver: true,
      mileage: true,
      status: true,
      hadPreviousAccidents: true,
      damageStatus: true,
      imageUrl: true,
      updatedAt: true,
      incidents: {
        select: {
          id: true,
        },
      },
    },
  },
  invitations: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
      inviter: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  },
};

router.use(authenticate);

router.get("/", requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const where = req.user!.isPlatformAdmin ? undefined : { id: req.user!.companyId };

    const companies = await prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    res.json({ data: companies });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/detail", requireAdmin, validateQuery(companyInvitationsQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!canManageCompanyScope(req.user!, req.params.id)) {
      return res.status(403).json({
        code: "FORBIDDEN",
        message: "Admin access required for this company",
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: companyDetailSelect,
    });

    if (!company) {
      return res.status(404).json({
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
      });
    }

    const statusFilter = (req.query as unknown as { status?: InvitationStatus }).status;
    const invitations = await Promise.all(
      company.invitations.map(async (invitation) => {
        if (invitation.status === InvitationStatus.PENDING && invitation.expiresAt.getTime() < Date.now()) {
          await markExpiredInvitation(invitation.id);
          return {
            ...invitation,
            status: InvitationStatus.EXPIRED,
          };
        }

        return invitation;
      }),
    );

    res.json({
      data: {
        ...company,
        invitations: invitations.filter((invitation) => !statusFilter || invitation.status === statusFilter),
        vehicles: company.vehicles.map(({ incidents, ...vehicle }) => ({
          ...vehicle,
          incidentCount: incidents.length,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/invitations", requireAdmin, validateBody(companyInvitationCreateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!canManageCompanyScope(req.user!, req.params.id)) {
      return res.status(403).json({
        code: "FORBIDDEN",
        message: "Admin access required for this company",
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true },
    });

    if (!company) {
      return res.status(404).json({
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: req.body.email },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (existingUser && !existingUser.deletedAt) {
      return res.status(400).json({
        code: "EMAIL_ALREADY_REGISTERED",
        message: "Email already registered",
      });
    }

    const existingPendingInvitation = await prisma.companyInvitation.findFirst({
      where: {
        companyId: company.id,
        email: req.body.email,
        status: InvitationStatus.PENDING,
      },
      select: { id: true },
    });

    if (existingPendingInvitation) {
      return res.status(409).json({
        code: "INVITATION_ALREADY_PENDING",
        message: "A pending invitation already exists for this email",
      });
    }

    const token = generateInvitationToken();
    const tokenHash = hashInvitationToken(token);
    const expiresAt = new Date(Date.now() + req.body.expiresInDays * 24 * 60 * 60 * 1000);
    const appUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "");

    const invitation = await prisma.companyInvitation.create({
      data: {
        companyId: company.id,
        invitedById: req.user!.id,
        email: req.body.email,
        role: req.body.role,
        tokenHash,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        inviter: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    const acceptUrl = `${appUrl}/register?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(req.body.email)}`;

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      companyId: company.id,
      action: "INVITATION_CREATE",
      entityType: SystemEntityType.INVITATION,
      entityId: invitation.id,
      metadata: {
        companyId: company.id,
        companyName: company.name,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    });

    await emitNotificationEvent(prisma, {
      userId: req.user!.id,
      companyId: company.id,
      action: "INVITATION_EMAIL_QUEUED",
      entityType: SystemEntityType.INVITATION,
      entityId: invitation.id,
      recipientEmail: invitation.email,
      channel: "EMAIL",
      payload: {
        companyId: company.id,
        companyName: company.name,
        acceptUrl,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    });

    const companyRecipients = await getCompanyNotificationRecipients(prisma, company.id, {
      minimumRole: "ADMIN",
      excludeUserIds: [req.user!.id],
    });

    await emitNotificationEvents(
      prisma,
      companyRecipients.map((recipient) => ({
        userId: recipient.id,
        companyId: company.id,
        action: "INVITATION_CREATED_NOTIFICATION",
        entityType: SystemEntityType.INVITATION,
        entityId: invitation.id,
        channel: "IN_APP" as const,
        payload: {
          notificationType: "INVITATION",
          title: "Invitation created",
          message: `${invitation.email} was invited to ${company.name}.`,
          priority: "LOW",
          link: "/companies",
          sourceKey: `invitation-created:${invitation.id}:${recipient.id}`,
          companyId: company.id,
        },
      })),
    );

    res.status(201).json({
      data: {
        ...invitation,
        acceptUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/invitations/:invitationId", requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!canManageCompanyScope(req.user!, req.params.id)) {
      return res.status(403).json({
        code: "FORBIDDEN",
        message: "Admin access required for this company",
      });
    }

    const invitation = await prisma.companyInvitation.findFirst({
      where: {
        id: req.params.invitationId,
        companyId: req.params.id,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        companyId: true,
      },
    });

    if (!invitation) {
      return res.status(404).json({
        code: "INVITATION_NOT_FOUND",
        message: "Invitation not found",
      });
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      return res.status(400).json({
        code: "INVITATION_NOT_REVOCABLE",
        message: "Only pending invitations can be revoked",
      });
    }

    await prisma.companyInvitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      companyId: invitation.companyId,
      action: "INVITATION_REVOKE",
      entityType: SystemEntityType.INVITATION,
      entityId: invitation.id,
      metadata: {
        companyId: invitation.companyId,
        email: invitation.email,
        role: invitation.role,
      },
    });

    const recipients = await getCompanyNotificationRecipients(prisma, invitation.companyId, {
      minimumRole: "ADMIN",
      excludeUserIds: [req.user!.id],
    });

    await emitNotificationEvents(
      prisma,
      recipients.map((recipient) => ({
        userId: recipient.id,
        companyId: invitation.companyId,
        action: "INVITATION_REVOKED_NOTIFICATION",
        entityType: SystemEntityType.INVITATION,
        entityId: invitation.id,
        channel: "IN_APP" as const,
        payload: {
          notificationType: "INVITATION",
          title: "Invitation revoked",
          message: `${invitation.email} invitation was revoked.`,
          priority: "LOW",
          link: "/companies",
          sourceKey: `invitation-revoked:${invitation.id}:${recipient.id}`,
          companyId: invitation.companyId,
        },
      })),
    );

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
