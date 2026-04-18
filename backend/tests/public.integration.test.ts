import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./helpers/prismaMock";

vi.mock("../src/utils/prisma.js", () => ({
  default: prismaMock,
}));

const { default: app } = await import("../src/app.js");

describe("public vehicle share links", () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it("serves a public share link as read-only data", async () => {
    prismaMock.vehiclePublicShareLink.findUnique.mockResolvedValue({
      id: "share-link-1",
      vehicleId: "vehicle-1",
      createdById: "manager-1",
      tokenHash: "hashed-token",
      label: "Customer snapshot",
      expiresAt: null,
      revokedAt: null,
      lastAccessedAt: null,
      accessCount: 2,
      createdAt: new Date("2026-04-18T08:00:00.000Z"),
      vehicle: {
        id: "vehicle-1",
        companyId: "company-1",
        model: "Audi A4",
        plate: "B-SC-1001",
        status: "ACTIVE",
        driver: "Anna Schmidt",
        firstRegistration: new Date("2023-01-10T00:00:00.000Z"),
        mileage: 12000,
        yearlyMileage: 18000,
        tuvDate: new Date("2026-10-01T00:00:00.000Z"),
        insuranceEnd: new Date("2026-12-31T00:00:00.000Z"),
        contractEnd: new Date("2027-01-15T00:00:00.000Z"),
        hadPreviousAccidents: true,
        damageStatus: "REPORTED",
        damageNotes: "Rear bumper incident",
        imageUrl: null,
        archivedAt: null,
        company: {
          id: "company-1",
          name: "Acme Fleet",
        },
        incidents: [],
        maintenanceRecords: [],
        documents: [],
      },
    });
    prismaMock.vehiclePublicShareLink.update.mockResolvedValue({
      id: "share-link-1",
    });

    const response = await request(app).get("/public/vehicles/plain-public-token");

    expect(response.status).toBe(200);
    expect(response.body.data.vehicle).toMatchObject({
      model: "Audi A4",
      plate: "B-SC-1001",
      status: "ACTIVE",
    });
    expect(prismaMock.systemLog.create).toHaveBeenCalled();
  });

  it("does not allow modifications through the public share route", async () => {
    const response = await request(app)
      .post("/public/vehicles/plain-public-token")
      .send({ status: "SOLD" });

    expect(response.status).toBe(404);
  });
});
