import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./helpers/prismaMock";

vi.mock("../src/utils/prisma.js", () => ({
  default: prismaMock,
}));

const { default: app } = await import("../src/app.js");

describe("notifications and activity routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    process.env.JWT_SECRET = "test-secret";
  });

  it("returns notification summary scoped to the authenticated user", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-ops-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.appNotification.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    prismaMock.appNotification.findMany.mockResolvedValue([
      {
        id: "notification-1",
        userId: "manager-ops-1",
        companyId: "company-1",
        type: "VEHICLE",
        title: "Vehicle transferred",
        message: "BMW i4 moved into your company scope.",
        status: "UNREAD",
        priority: "HIGH",
        entityType: "VEHICLE",
        entityId: "vehicle-1",
        link: "/vehicles/vehicle-1",
        metadata: null,
        createdAt: new Date("2026-04-13T10:00:00.000Z"),
        updatedAt: new Date("2026-04-13T10:00:00.000Z"),
      },
    ]);

    const token = jwt.sign({ userId: "manager-ops-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .get("/notifications/summary")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      unreadCount: 3,
      highPriorityUnreadCount: 1,
    });
    expect(response.body.data.items).toHaveLength(1);
    expect(prismaMock.appNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "manager-ops-1",
        }),
      }),
    );
  });

  it("marks a notification as read only within the authenticated user scope", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-ops-2",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.appNotification.updateMany.mockResolvedValue({ count: 1 });

    const token = jwt.sign({ userId: "manager-ops-2" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/notifications/notification-2/read")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(prismaMock.appNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "notification-2",
          userId: "manager-ops-2",
        }),
      }),
    );
  });

  it("returns a human-friendly activity feed within company scope", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-ops-3",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.systemLog.findMany.mockResolvedValue([
      {
        id: "activity-1",
        action: "VEHICLE_TRANSFER",
        entityType: "VEHICLE",
        entityId: "vehicle-77",
        companyId: "company-1",
        userId: "manager-ops-3",
        metadata: {
          model: "BMW X5",
          fromCompanyId: "company-2",
          toCompanyId: "company-1",
        },
        timestamp: new Date("2026-04-13T09:30:00.000Z"),
        user: {
          id: "manager-ops-3",
          email: "manager@solicar.com",
          companyId: "company-1",
        },
      },
    ]);

    const token = jwt.sign({ userId: "manager-ops-3" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .get("/activity?page=1&pageSize=10")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items[0]).toMatchObject({
      id: "activity-1",
      title: "Vehicle transferred",
      entityType: "VEHICLE",
      link: "/vehicles/vehicle-77",
    });
    expect(prismaMock.systemLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { companyId: "company-1" },
            {
              companyId: null,
              user: {
                companyId: "company-1",
                deletedAt: null,
              },
            },
          ],
        }),
      }),
    );
  });
});
