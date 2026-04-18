import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./helpers/prismaMock";

vi.mock("../src/utils/prisma.js", () => ({
  default: prismaMock,
}));

const { default: app } = await import("../src/app.js");

describe("support ticket routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    process.env.JWT_SECRET = "test-secret";
  });

  it("creates a support ticket thread for an authenticated user", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.supportTicket.create.mockResolvedValue({
      id: "ticket-1",
      userId: "manager-1",
      companyId: "company-1",
    });
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: "ticket-1",
      category: "TECHNICAL",
      status: "OPEN",
      priority: "MEDIUM",
      createdAt: "2026-04-11T09:00:00.000Z",
      updatedAt: "2026-04-11T09:00:00.000Z",
      company: {
        id: "company-1",
        name: "Fleet Partners",
      },
      user: {
        id: "manager-1",
        email: "manager@solicar.com",
        role: "MANAGER",
      },
      messages: [
        {
          id: "message-1",
          message: "The vehicle detail page does not refresh after transfer.",
          attachmentUrl: null,
          timestamp: "2026-04-11T09:00:00.000Z",
          sender: {
            id: "manager-1",
            email: "manager@solicar.com",
            role: "MANAGER",
          },
        },
      ],
    });

    const token = jwt.sign({ userId: "manager-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/tickets")
      .set("Authorization", `Bearer ${token}`)
      .field("category", "TECHNICAL")
      .field("message", "The vehicle detail page does not refresh after transfer.");

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: "ticket-1",
      status: "OPEN",
    });
    expect(prismaMock.ticketMessage.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "TICKET_CREATE",
          entityId: "ticket-1",
        }),
      }),
    );
  });

  it("lets admins reply to tickets and moves open tickets into progress", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@solicar.com",
      role: "ADMIN",
      companyId: "company-admin",
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.supportTicket.findUnique
      .mockResolvedValueOnce({
        id: "ticket-2",
        status: "OPEN",
      })
      .mockResolvedValueOnce({
        id: "ticket-2",
        category: "TECHNICAL",
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        createdAt: "2026-04-10T08:00:00.000Z",
        updatedAt: "2026-04-11T10:00:00.000Z",
        company: {
          id: "company-1",
          name: "Fleet Partners",
        },
        user: {
          id: "manager-1",
          email: "manager@solicar.com",
          role: "MANAGER",
        },
        messages: [
          {
            id: "message-1",
            message: "Initial ticket message",
            attachmentUrl: null,
            timestamp: "2026-04-10T08:00:00.000Z",
            sender: {
              id: "manager-1",
              email: "manager@solicar.com",
              role: "MANAGER",
            },
          },
          {
            id: "message-2",
            message: "We are investigating the issue now.",
            attachmentUrl: null,
            timestamp: "2026-04-11T10:00:00.000Z",
            sender: {
              id: "admin-1",
              email: "admin@solicar.com",
              role: "ADMIN",
            },
          },
        ],
      });

    const token = jwt.sign({ userId: "admin-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/admin/tickets/ticket-2/messages")
      .set("Authorization", `Bearer ${token}`)
      .field("message", "We are investigating the issue now.");

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("IN_PROGRESS");
    expect(prismaMock.ticketMessage.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ticket-2" },
        data: expect.objectContaining({
          status: "IN_PROGRESS",
        }),
      }),
    );
    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ADMIN_TICKET_REPLY",
          entityId: "ticket-2",
        }),
      }),
    );
  });
});
