import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./helpers/prismaMock";

vi.mock("../src/utils/prisma.js", () => ({
  default: prismaMock,
}));

const { default: app } = await import("../src/app.js");

describe("approval flow routes", () => {
  const companyId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    resetPrismaMock();
    process.env.JWT_SECRET = "test-secret";
    process.env.APPROVAL_FLOW_ENABLED = "true";
  });

  it("creates an approval request instead of executing a sensitive admin action immediately", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "platform-admin-1",
      email: "admin@solicar.com",
      role: "ADMIN",
      companyId: "company-1",
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.company.findUnique.mockResolvedValue({
      id: companyId,
      name: "Fleet Partners",
    });
    prismaMock.approvalRequest.create.mockResolvedValue({
      id: "approval-1",
      action: "ADMIN_USER_CREATE",
      status: "PENDING",
      entityType: "USER",
      entityId: null,
      payload: {
        email: "new.user@fleet.test",
        role: "MANAGER",
      },
      reason: null,
      reviewComment: null,
      companyId,
      createdAt: new Date("2026-04-13T10:00:00.000Z"),
      updatedAt: new Date("2026-04-13T10:00:00.000Z"),
      requestedBy: {
        id: "platform-admin-1",
        email: "admin@solicar.com",
      },
      reviewedBy: null,
      company: {
        id: companyId,
        name: "Fleet Partners",
      },
    });

    const token = jwt.sign({ userId: "platform-admin-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "new.user@fleet.test",
        password: "Secret123!",
        role: "MANAGER",
        companyId,
        isPlatformAdmin: false,
      });

    expect(response.status).toBe(202);
    expect(response.body.data.action).toBe("approval_requested");
    expect(response.body.data.approval).toMatchObject({
      id: "approval-1",
      status: "PENDING",
      action: "ADMIN_USER_CREATE",
    });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "APPROVAL_REQUEST_CREATE",
          entityType: "APPROVAL",
          entityId: "approval-1",
        }),
      }),
    );
  });

  it("blocks non-platform-admin users from approving requests", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });

    const token = jwt.sign({ userId: "manager-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/admin/approvals/approval-2/approve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        reviewComment: "Looks good",
      });

    expect(response.status).toBe(403);
    expect(prismaMock.approvalRequest.findUnique).not.toHaveBeenCalled();
  });

  it("allows a platform admin to approve a pending request and execute the action", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: "platform-admin-2",
        email: "admin@solicar.com",
        role: "ADMIN",
        companyId: "company-1",
        isPlatformAdmin: true,
        registrationType: "COMPANY",
        deletedAt: null,
      })
      .mockResolvedValueOnce(null);
    prismaMock.approvalRequest.findUnique.mockResolvedValue({
      id: "approval-approve-1",
      companyId,
      requestedById: "platform-admin-1",
      reviewedById: null,
      action: "ADMIN_USER_CREATE",
      status: "PENDING",
      entityType: "USER",
      entityId: null,
      payload: {
        email: "approved.user@fleet.test",
        password: "Secret123!",
        role: "MANAGER",
        companyId,
        isPlatformAdmin: false,
      },
      reason: null,
      reviewComment: null,
      reviewedAt: null,
      createdAt: new Date("2026-04-13T10:00:00.000Z"),
      updatedAt: new Date("2026-04-13T10:00:00.000Z"),
    });
    prismaMock.company.findUnique.mockResolvedValue({
      id: companyId,
    });
    prismaMock.user.create.mockResolvedValue({
      id: "created-user-1",
      email: "approved.user@fleet.test",
      role: "MANAGER",
      companyId,
      isPlatformAdmin: false,
    });
    prismaMock.approvalRequest.update.mockResolvedValue({
      id: "approval-approve-1",
      companyId,
      requestedById: "platform-admin-1",
      reviewedById: "platform-admin-2",
      action: "ADMIN_USER_CREATE",
      status: "APPROVED",
      entityType: "USER",
      entityId: "created-user-1",
      payload: {
        email: "approved.user@fleet.test",
      },
      reason: null,
      reviewComment: "Approved for onboarding",
      reviewedAt: new Date("2026-04-13T11:00:00.000Z"),
      createdAt: new Date("2026-04-13T10:00:00.000Z"),
      updatedAt: new Date("2026-04-13T11:00:00.000Z"),
      requestedBy: {
        id: "platform-admin-1",
        email: "requester@solicar.com",
      },
      reviewedBy: {
        id: "platform-admin-2",
        email: "admin@solicar.com",
      },
      company: {
        id: companyId,
        name: "Fleet Partners",
      },
    });

    const token = jwt.sign({ userId: "platform-admin-2" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/admin/approvals/approval-approve-1/approve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        reviewComment: "Approved for onboarding",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: "approval-approve-1",
      status: "APPROVED",
      entityId: "created-user-1",
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "approved.user@fleet.test",
          companyId,
        }),
      }),
    );
  });

  it("allows a platform admin to reject a pending request", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "platform-admin-3",
      email: "admin@solicar.com",
      role: "ADMIN",
      companyId: "company-1",
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.approvalRequest.findUnique.mockResolvedValue({
      id: "approval-reject-1",
      companyId,
      requestedById: "platform-admin-1",
      reviewedById: null,
      action: "ADMIN_VEHICLE_DELETE",
      status: "PENDING",
      entityType: "VEHICLE",
      entityId: "vehicle-1",
      payload: {
        vehicleId: "vehicle-1",
      },
      reason: "Double check before deletion",
      reviewComment: null,
      reviewedAt: null,
      createdAt: new Date("2026-04-13T10:00:00.000Z"),
      updatedAt: new Date("2026-04-13T10:00:00.000Z"),
    });
    prismaMock.approvalRequest.update.mockResolvedValue({
      id: "approval-reject-1",
      companyId,
      requestedById: "platform-admin-1",
      reviewedById: "platform-admin-3",
      action: "ADMIN_VEHICLE_DELETE",
      status: "REJECTED",
      entityType: "VEHICLE",
      entityId: "vehicle-1",
      payload: {
        vehicleId: "vehicle-1",
      },
      reason: "Double check before deletion",
      reviewComment: "Rejected pending audit review",
      reviewedAt: new Date("2026-04-13T11:00:00.000Z"),
      createdAt: new Date("2026-04-13T10:00:00.000Z"),
      updatedAt: new Date("2026-04-13T11:00:00.000Z"),
      requestedBy: {
        id: "platform-admin-1",
        email: "requester@solicar.com",
      },
      reviewedBy: {
        id: "platform-admin-3",
        email: "admin@solicar.com",
      },
      company: {
        id: companyId,
        name: "Fleet Partners",
      },
    });

    const token = jwt.sign({ userId: "platform-admin-3" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/admin/approvals/approval-reject-1/reject")
      .set("Authorization", `Bearer ${token}`)
      .send({
        reviewComment: "Rejected pending audit review",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: "approval-reject-1",
      status: "REJECTED",
    });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});
