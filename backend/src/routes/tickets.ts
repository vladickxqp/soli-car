import { NextFunction, Response, Router } from "express";
import { SystemEntityType, TicketStatus } from "@prisma/client";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { supportTicketCreateSchema, supportTicketMessageSchema } from "../validation/schemas.js";
import {
  getTicketAttachmentFileName,
  readTicketAttachment,
  ticketUpload,
  toTicketAttachmentPath,
} from "../utils/ticketUploads.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { emitNotificationEvent, emitNotificationEvents, getPlatformAdminRecipients } from "../services/notifications.js";

const router = Router();

const ticketSelect = {
  id: true,
  category: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  company: {
    select: {
      id: true,
      name: true,
    },
  },
  vehicle: {
    select: {
      id: true,
      model: true,
      plate: true,
      damageStatus: true,
    },
  },
  vehicleIncident: {
    select: {
      id: true,
      title: true,
      status: true,
      occurredAt: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      role: true,
    },
  },
  messages: {
    orderBy: { timestamp: "asc" as const },
    select: {
      id: true,
      message: true,
      attachmentUrl: true,
      timestamp: true,
      sender: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  },
};

const toAttachmentRoute = (messageId: string, attachmentUrl?: string | null) =>
  attachmentUrl ? `/tickets/messages/${messageId}/attachment` : null;

const serializeTicket = <T extends { messages: Array<{ id: string; attachmentUrl?: string | null }> }>(ticket: T) => ({
  ...ticket,
  messages: ticket.messages.map((message) => ({
    ...message,
    attachmentUrl: toAttachmentRoute(message.id, message.attachmentUrl),
  })),
});

router.use(authenticate);

router.get("/messages/:messageId/attachment", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const message = await prisma.ticketMessage.findUnique({
      where: { id: req.params.messageId },
      include: {
        ticket: {
          select: {
            id: true,
            userId: true,
            companyId: true,
          },
        },
      },
    });

    if (!message?.attachmentUrl) {
      return res.status(404).json({
        code: "ATTACHMENT_NOT_FOUND",
        message: "Attachment not found",
      });
    }

    const canAccess =
      req.user!.isPlatformAdmin ||
      message.ticket.userId === req.user!.id;

    if (!canAccess) {
      return res.status(403).json({
        code: "FORBIDDEN",
        message: "Forbidden",
      });
    }

    const { absolutePath } = await readTicketAttachment(message.attachmentUrl);
    res.sendFile(absolutePath, {
      headers: {
        "Content-Disposition": `inline; filename="${encodeURIComponent(
          getTicketAttachmentFileName(message.attachmentUrl),
        )}"`,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: {
        userId: req.user!.id,
      },
      orderBy: { updatedAt: "desc" },
      select: ticketSelect,
    });

    res.json({ data: tickets.map(serializeTicket) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
      select: ticketSelect,
    });

    if (!ticket) {
      return res.status(404).json({
        code: "TICKET_NOT_FOUND",
        message: "Ticket not found",
      });
    }

    res.json({ data: serializeTicket(ticket) });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/",
  ticketUpload.single("attachment"),
  validateBody(supportTicketCreateSchema),
  async (req: AuthRequest & { file?: Express.Multer.File }, res: Response, next: NextFunction) => {
    try {
      let referencedVehicle:
        | {
            id: string;
            companyId: string;
          }
        | null = null;
      let referencedIncident:
        | {
            id: string;
            vehicleId: string;
          }
        | null = null;

      if (req.body.vehicleId) {
        referencedVehicle = await prisma.vehicle.findFirst({
          where: {
            id: req.body.vehicleId,
            companyId: req.user!.companyId,
            deletedAt: null,
          },
          select: {
            id: true,
            companyId: true,
          },
        });

        if (!referencedVehicle) {
          return res.status(400).json({
            code: "VEHICLE_NOT_FOUND",
            message: "Vehicle not found",
          });
        }
      }

      if (req.body.vehicleIncidentId) {
        referencedIncident = await prisma.vehicleIncident.findFirst({
          where: {
            id: req.body.vehicleIncidentId,
            vehicleId: req.body.vehicleId,
          },
          select: {
            id: true,
            vehicleId: true,
          },
        });

        if (!referencedIncident) {
          return res.status(400).json({
            code: "INCIDENT_NOT_FOUND",
            message: "Incident not found",
          });
        }
      }

      const ticket = await prisma.$transaction(async (tx) => {
        const createdTicket = await tx.supportTicket.create({
          data: {
            userId: req.user!.id,
            companyId: req.user!.companyId,
            vehicleId: referencedVehicle?.id ?? null,
            vehicleIncidentId: referencedIncident?.id ?? null,
            category: req.body.category,
            status: "OPEN",
            priority: "MEDIUM",
          },
        });

        await tx.ticketMessage.create({
          data: {
            ticketId: createdTicket.id,
            senderId: req.user!.id,
            message: req.body.message,
            attachmentUrl: toTicketAttachmentPath(req.file),
          },
        });

        await createSystemLogFromUnknown(tx, {
          userId: req.user!.id,
          companyId: req.user!.companyId,
          action: "TICKET_CREATE",
          entityType: SystemEntityType.TICKET,
          entityId: createdTicket.id,
          metadata: {
            category: req.body.category,
            companyId: req.user!.companyId,
            attachment: Boolean(req.file),
            vehicleId: referencedVehicle?.id ?? null,
            vehicleIncidentId: referencedIncident?.id ?? null,
          },
        });

        const admins = await getPlatformAdminRecipients(tx, []);
        await emitNotificationEvents(
          tx,
          admins.map((admin) => ({
            userId: admin.id,
            companyId: req.user!.companyId,
            action: "SUPPORT_TICKET_CREATED_NOTIFICATION",
            entityType: SystemEntityType.TICKET,
            entityId: createdTicket.id,
            channel: "IN_APP" as const,
            payload: {
              notificationType: "SUPPORT",
              title: "Support ticket opened",
              message: `A new ${req.body.category.toLowerCase()} ticket was created.`,
              priority: "MEDIUM",
              link: "/admin/tickets",
              sourceKey: `ticket-created:${createdTicket.id}:${admin.id}`,
              companyId: req.user!.companyId,
              vehicleId: referencedVehicle?.id ?? null,
            },
          })),
        );

        return createdTicket;
      });

      const createdTicket = await prisma.supportTicket.findUnique({
        where: { id: ticket.id },
        select: ticketSelect,
      });

      res.status(201).json({ data: createdTicket ? serializeTicket(createdTicket) : createdTicket });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/messages",
  ticketUpload.single("attachment"),
  validateBody(supportTicketMessageSchema),
  async (req: AuthRequest & { file?: Express.Multer.File }, res: Response, next: NextFunction) => {
    try {
      const existingTicket = await prisma.supportTicket.findFirst({
        where: {
          id: req.params.id,
          userId: req.user!.id,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!existingTicket) {
        return res.status(404).json({
          code: "TICKET_NOT_FOUND",
          message: "Ticket not found",
        });
      }

      if (existingTicket.status === TicketStatus.CLOSED) {
        return res.status(400).json({
          code: "TICKET_CLOSED",
          message: "Closed tickets must be reopened by an admin before new messages can be added",
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.ticketMessage.create({
          data: {
            ticketId: existingTicket.id,
            senderId: req.user!.id,
            message: req.body.message,
            attachmentUrl: toTicketAttachmentPath(req.file),
          },
        });

        await tx.supportTicket.update({
          where: { id: existingTicket.id },
          data: {
            updatedAt: new Date(),
          },
        });

        await createSystemLogFromUnknown(tx, {
          userId: req.user!.id,
          companyId: req.user!.companyId,
          action: "TICKET_MESSAGE_CREATE",
          entityType: SystemEntityType.TICKET,
          entityId: existingTicket.id,
          metadata: {
            attachment: Boolean(req.file),
            senderScope: "USER",
          },
        });

        const admins = await getPlatformAdminRecipients(tx, []);
        await emitNotificationEvents(
          tx,
          admins.map((admin) => ({
            userId: admin.id,
            companyId: req.user!.companyId,
            action: "SUPPORT_TICKET_UPDATED_NOTIFICATION",
            entityType: SystemEntityType.TICKET,
            entityId: existingTicket.id,
            channel: "IN_APP" as const,
            payload: {
              notificationType: "SUPPORT",
              title: "Support ticket updated",
              message: "A customer added a new reply to an active ticket.",
              priority: "MEDIUM",
              link: "/admin/tickets",
              sourceKey: `ticket-user-reply:${existingTicket.id}:${admin.id}:${Date.now()}`,
              companyId: req.user!.companyId,
            },
          })),
        );
      });

      const ticket = await prisma.supportTicket.findUnique({
        where: { id: existingTicket.id },
        select: ticketSelect,
      });

      res.json({ data: ticket ? serializeTicket(ticket) : ticket });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
