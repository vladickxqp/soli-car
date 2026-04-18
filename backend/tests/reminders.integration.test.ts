import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./helpers/prismaMock";

vi.mock("../src/utils/prisma.js", () => ({
  default: prismaMock,
}));

const { default: app } = await import("../src/app.js");

describe("reminder routes", () => {
  const ownCompanyId = "11111111-1111-4111-8111-111111111111";
  const otherCompanyId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    resetPrismaMock();
    process.env.JWT_SECRET = "test-secret";
  });

  it("generates upcoming, due, and overdue reminders from due dates", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-reminder-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findMany.mockResolvedValue([
      {
        id: "vehicle-overdue",
        model: "BMW i4",
        plate: "B-SC-1001",
        status: "ACTIVE",
        companyId: "company-1",
        tuvDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        insuranceEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        contractEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        company: { name: "Fleet Partners" },
      },
    ]);
    prismaMock.vehicleMaintenanceRecord.findMany.mockResolvedValue([
      {
        id: "maintenance-due",
        title: "Service slot",
        reminderDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        status: "SCHEDULED",
        vehicle: {
          id: "vehicle-overdue",
          model: "BMW i4",
          plate: "B-SC-1001",
          status: "ACTIVE",
          companyId: "company-1",
          company: { name: "Fleet Partners" },
        },
      },
    ]);
    prismaMock.vehicleDocument.findMany.mockResolvedValue([]);

    const token = jwt.sign({ userId: "manager-reminder-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .get("/reminders")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.some((item: { type: string; state: string }) => item.type === "TUV" && item.state === "OVERDUE")).toBe(true);
    expect(response.body.data.some((item: { type: string; state: string }) => item.type === "MAINTENANCE" && item.state === "DUE")).toBe(true);
    expect(response.body.data.some((item: { type: string; state: string }) => item.type === "CONTRACT" && item.state === "UPCOMING")).toBe(true);
  });

  it("respects company scoping for non-platform-admin reminder access", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-reminder-2",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: ownCompanyId,
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findMany.mockResolvedValue([]);
    prismaMock.vehicleMaintenanceRecord.findMany.mockResolvedValue([]);
    prismaMock.vehicleDocument.findMany.mockResolvedValue([]);

    const token = jwt.sign({ userId: "manager-reminder-2" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .get(`/reminders?companyId=${otherCompanyId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(prismaMock.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: ownCompanyId,
        }),
      }),
    );
  });

  it("allows platform admins to filter reminders by company scope", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "platform-admin-reminder",
      email: "admin@solicar.com",
      role: "ADMIN",
      companyId: ownCompanyId,
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findMany.mockResolvedValue([]);
    prismaMock.vehicleMaintenanceRecord.findMany.mockResolvedValue([]);
    prismaMock.vehicleDocument.findMany.mockResolvedValue([]);

    const token = jwt.sign({ userId: "platform-admin-reminder" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .get(`/reminders?companyId=${otherCompanyId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(prismaMock.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: otherCompanyId,
        }),
      }),
    );
  });
});
