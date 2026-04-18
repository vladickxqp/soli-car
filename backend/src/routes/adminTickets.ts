import { NextFunction, Response, Router } from "express";
import { SystemEntityType, TicketStatus } from "@prisma/client";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate, requirePlatformAdmin } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  adminTicketsQuerySchema,
  adminTicketUpdateSchema,
  supportTicketMessageSchema,
} from "../validation/schemas.js";
import { getPaginationMeta } from "../utils/pagination.js";
import { ticketUpload, toTicketAttachmentPath } from "../utils/ticketUploads.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { emitNotificationEvent } from "../services/notifications.js";

const router = Router();

const ticketListSelect = {
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
    take: 1,
    orderBy: { timestamp: "desc" as const },
    select: {
      id: true,
      message: true,
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

const ticketDetailSelect = {
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

router.use(authenticate, requirePlatformAdmin);

router.get("/", validateQuery(adminTicketsQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { search, status, priority, companyId, page, pageSize } = req.query as unknown as {
      search?: string;
      status?: "OPEN" | "IN_PROGRESS" | "CLOSED";
      priority?: "LOW" | "MEDIUM" | "HIGH";
      companyId?: string;
      page: number;
      pageSize: number;
    };

    const where = {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(companyId ? { companyId } : {}),
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: "insensitive" as const } },
              { company: { name: { contains: search, mode: "insensitive" as const } } },
              { user: { email: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const total = await prisma.supportTicket.count({ where });
    const pagination = getPaginationMeta(page, pageSize, total);

    const tickets = await prisma.supportTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: ticketListSelect,
    });

    res.json({
      data: {
        items: tickets,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      select: ticketDetailSelect,
    });

    if (!ticket) {
      return res.status(404).json({
        code: "TICKET_NOT_FOUND",
        message: "Ticket not found",
      });
    }

    res.json({ data: ticket ? serializeTicket(ticket) : ticket });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/messages",
  ticketUpload.single("attachment"),
  validateBody(supportTicketMessageSchema),
  async (req: AuthRequest & { file?: Express.Multer.File }, res: Response, next: NextFunction) => {
    try {
      const existingTicket = await prisma.supportTicket.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          status: true,
          userId: true,
          companyId: true,
        },
      });

      if (!existingTicket) {
        return res.status(404).json({
          code: "TICKET_NOT_FOUND",
          message: "Ticket not found",
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
            status: existingTicket.status === TicketStatus.OPEN ? TicketStatus.IN_PROGRESS : existingTicket.status,
            updatedAt: new Date(),
          },
        });

        await createSystemLogFromUnknown(tx, {
          userId: req.user!.id,
          companyId: existingTicket.companyId,
          action: "ADMIN_TICKET_REPLY",
          entityType: SystemEntityType.TICKET,
          entityId: existingTicket.id,
          metadata: {
            attachment: Boolean(req.file),
            previousStatus: existingTicket.status,
            nextStatus: existingTicket.status === TicketStatus.OPEN ? TicketStatus.IN_PROGRESS : existingTicket.status,
          },
        });

        if (existingTicket.userId) {
          await emitNotificationEvent(tx, {
            userId: existingTicket.userId,
            companyId: existingTicket.companyId,
            action: "ADMIN_SUPPORT_REPLY_NOTIFICATION",
            entityType: SystemEntityType.TICKET,
            entityId: existingTicket.id,
            channel: "IN_APP",
            payload: {
              notificationType: "SUPPORT",
              title: "Support replied",
              message: "A new admin reply is available in your support thread.",
              priority: "MEDIUM",
              link: "/support",
              sourceKey: `ticket-admin-reply:${existingTicket.id}:${Date.now()}`,
              companyId: existingTicket.companyId,
            },
          });
        }
      });

      const ticket = await prisma.supportTicket.findUnique({
        where: { id: existingTicket.id },
        select: ticketDetailSelect,
      });

      res.json({ data: ticket ? serializeTicket(ticket) : ticket });
    } catch (error) {
      next(error);
    }
  },
);

router.patch("/:id", validateBody(adminTicketUpdateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existingTicket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        status: true,
        priority: true,
        userId: true,
        companyId: true,
      },
    });

    if (!existingTicket) {
      return res.status(404).json({
        code: "TICKET_NOT_FOUND",
        message: "Ticket not found",
      });
    }

    const updatedTicket = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.status ? { status: req.body.status } : {}),
        ...(req.body.priority ? { priority: req.body.priority } : {}),
      },
      select: ticketDetailSelect,
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      companyId: existingTicket.companyId,
      action: "ADMIN_TICKET_UPDATE",
      entityType: SystemEntityType.TICKET,
      entityId: updatedTicket.id,
      metadata: {
        previousStatus: existingTicket.status,
        nextStatus: updatedTicket.status,
        previousPriority: existingTicket.priority,
        nextPriority: updatedTicket.priority,
      },
    });

    if (existingTicket.status !== updatedTicket.status) {
      await createSystemLogFromUnknown(prisma, {
        userId: req.user!.id,
        companyId: existingTicket.companyId,
        action: "TICKET_STATUS_CHANGE",
        entityType: SystemEntityType.TICKET,
        entityId: updatedTicket.id,
        metadata: {
          previousStatus: existingTicket.status,
          nextStatus: updatedTicket.status,
        },
      });
    }

    if (existingTicket.userId) {
      await emitNotificationEvent(prisma, {
        userId: existingTicket.userId,
        companyId: existingTicket.companyId,
        action: "SUPPORT_TICKET_STATUS_NOTIFICATION",
        entityType: SystemEntityType.TICKET,
        entityId: updatedTicket.id,
        channel: "IN_APP",
        payload: {
          notificationType: "SUPPORT",
          title: "Support ticket updated",
          message: `Your support ticket is now ${updatedTicket.status}.`,
          priority: updatedTicket.status === "CLOSED" ? "LOW" : "MEDIUM",
          link: "/support",
          sourceKey: `ticket-status:${updatedTicket.id}:${updatedTicket.status}:${updatedTicket.priority}`,
          companyId: existingTicket.companyId,
        },
      });
    }

    res.json({ data: serializeTicket(updatedTicket) });
  } catch (error) {
    next(error);
  }
});

export default router;
