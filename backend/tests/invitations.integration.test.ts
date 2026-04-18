import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./helpers/prismaMock";

vi.mock("../src/utils/prisma.js", () => ({
  default: prismaMock,
}));

const { default: app } = await import("../src/app.js");

describe("company invitation routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    process.env.JWT_SECRET = "test-secret";
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("allows a company admin to invite a user into their own company without granting platform access", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: "company-admin-1",
        email: "companyadmin@solicar.com",
        role: "ADMIN",
        companyId: "company-1",
        isPlatformAdmin: false,
        registrationType: "COMPANY",
        deletedAt: null,
      })
      .mockResolvedValueOnce(null);
    prismaMock.company.findUnique.mockResolvedValue({
      id: "company-1",
      name: "Fleet Partners",
    });
    prismaMock.companyInvitation.findFirst.mockResolvedValue(null);
    prismaMock.companyInvitation.create.mockResolvedValue({
      id: "invite-1",
      email: "new.user@fleet.test",
      role: "MANAGER",
      status: "PENDING",
      expiresAt: new Date("2026-04-20T10:00:00.000Z"),
      createdAt: new Date("2026-04-12T10:00:00.000Z"),
      inviter: {
        id: "company-admin-1",
        email: "companyadmin@solicar.com",
      },
    });

    const token = jwt.sign({ userId: "company-admin-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/companies/company-1/invitations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "new.user@fleet.test",
        role: "MANAGER",
        expiresInDays: 7,
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: "invite-1",
      email: "new.user@fleet.test",
      role: "MANAGER",
      status: "PENDING",
    });
    expect(response.body.data.acceptUrl).toContain("/register?invite=");
    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "INVITATION_CREATE",
          entityId: "invite-1",
        }),
      }),
    );
  });

  it("blocks non-admin users from inviting company members", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-1",
      email: "user@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });

    const token = jwt.sign({ userId: "manager-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/companies/company-1/invitations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "blocked.user@fleet.test",
        role: "VIEWER",
        expiresInDays: 7,
      });

    expect(response.status).toBe(403);
    expect(prismaMock.companyInvitation.create).not.toHaveBeenCalled();
  });

  it("accepts a valid invitation without elevating the new user to platform admin", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.companyInvitation.findUnique.mockResolvedValue({
      id: "invite-accept-1",
      email: "joiner@fleet.test",
      role: "MANAGER",
      status: "PENDING",
      expiresAt: new Date("2026-04-20T10:00:00.000Z"),
      company: {
        id: "company-1",
        name: "Fleet Partners",
      },
      inviter: {
        email: "companyadmin@solicar.com",
      },
    });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription-1",
      companyId: "company-1",
      plan: "FREE",
      status: "ACTIVE",
    });
    prismaMock.user.create.mockResolvedValue({
      id: "user-new-1",
      email: "joiner@fleet.test",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
    });
    prismaMock.companyInvitation.update.mockResolvedValue({
      id: "invite-accept-1",
      status: "ACCEPTED",
    });

    const response = await request(app).post("/auth/register").send({
      email: "joiner@fleet.test",
      password: "Secret123!",
      registrationType: "COMPANY",
      invitationToken: "invite-token-123",
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      success: true,
      requiresEmailVerification: true,
      email: "joiner@fleet.test",
    });
    expect(prismaMock.companyInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "invite-accept-1" },
        data: expect.objectContaining({
          status: "ACCEPTED",
          acceptedById: "user-new-1",
        }),
      }),
    );
  });

  it("rejects revoked invitations during registration", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.companyInvitation.findUnique.mockResolvedValue({
      id: "invite-revoked-1",
      email: "joiner@fleet.test",
      role: "VIEWER",
      status: "REVOKED",
      expiresAt: new Date("2026-04-20T10:00:00.000Z"),
      company: {
        id: "company-1",
        name: "Fleet Partners",
      },
      inviter: {
        email: "companyadmin@solicar.com",
      },
    });

    const response = await request(app).post("/auth/register").send({
      email: "joiner@fleet.test",
      password: "Secret123!",
      registrationType: "COMPANY",
      invitationToken: "invite-token-revoked",
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVITATION_NOT_ACCEPTABLE");
  });

  it("marks expired invitations and prevents acceptance", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.companyInvitation.findUnique.mockResolvedValue({
      id: "invite-expired-1",
      email: "joiner@fleet.test",
      role: "VIEWER",
      status: "PENDING",
      expiresAt: new Date("2026-04-01T10:00:00.000Z"),
      company: {
        id: "company-1",
        name: "Fleet Partners",
      },
      inviter: {
        email: "companyadmin@solicar.com",
      },
    });
    prismaMock.companyInvitation.update.mockResolvedValue({
      id: "invite-expired-1",
      status: "EXPIRED",
    });

    const response = await request(app).post("/auth/register").send({
      email: "joiner@fleet.test",
      password: "Secret123!",
      registrationType: "COMPANY",
      invitationToken: "invite-token-expired",
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVITATION_EXPIRED");
    expect(prismaMock.companyInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "invite-expired-1" },
        data: { status: "EXPIRED" },
      }),
    );
  });
});
