import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./helpers/prismaMock";

vi.mock("../src/utils/prisma.js", () => ({
  default: prismaMock,
}));

vi.mock("../src/utils/vehicleFiles.js", async () => {
  const multer = (await import("multer")).default;
  const path = await import("node:path");
  const { createAppError } = await import("../src/utils/httpError.js");
  const upload = multer({ dest: path.resolve(process.cwd(), "test-uploads", "vehicle-documents") });
  const documentUpload = multer({
    dest: path.resolve(process.cwd(), "test-uploads", "vehicle-documents"),
    fileFilter: (_req, file, callback) => {
      const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"]);
      if (!allowedTypes.has(file.mimetype)) {
        callback(createAppError(400, "UNSUPPORTED_FILE_TYPE", "Unsupported file type"));
        return;
      }

      callback(null, true);
    },
  });

  return {
    vehicleDocumentUpload: documentUpload,
    vehicleImageUpload: upload,
    buildStoredFileMetadata: (file: Express.Multer.File) => ({
      originalName: file.originalname,
      storagePath: `/uploads/vehicle-documents/${file.originalname}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    }),
    getPublicImageUrl: (file: Express.Multer.File) => `/uploads/vehicle-images/${file.originalname}`,
    readStoredFile: vi.fn(),
    removeStoredFile: vi.fn(),
    getDownloadFileName: (originalName: string) => originalName,
  };
});

const { default: app } = await import("../src/app.js");

const buildVehiclePayload = (overrides: Record<string, unknown> = {}) => ({
  model: "BMW i4 eDrive40",
  firstRegistration: "2024-01-12",
  vin: "SCDEMO12345678901",
  hsn: "0005",
  tsn: "ABC",
  price: "58990",
  tuvDate: "2026-05-01",
  tireStorage: "Berlin Depot",
  plate: "B-SC-1001",
  lastUpdate: "2026-04-11",
  driver: "Alice Becker",
  contractType: "Operational Leasing",
  contractValue: "52900",
  interest: "3.1",
  contractStart: "2024-01-12",
  contractEnd: "2027-01-12",
  leasingPartner: "Mobility Lease Europe",
  customerNumber: "CUST-1001",
  inventoryNumber: "INV-1001",
  contractPartner: "Soli Car Contracts",
  billingFrom: "2024-01-12",
  leasingRate: "699",
  billedTo: "2027-01-12",
  insurancePartner: "Allianz Fleet",
  insuranceNumber: "INS-1001",
  insuranceCost: "1290",
  insuranceStart: "2024-01-12",
  insuranceEnd: "2026-06-01",
  mileage: 19350,
  yearlyMileage: 25000,
  taxPerYear: "0",
  paymentDate: "2026-05-01",
  status: "ACTIVE",
  hadPreviousAccidents: false,
  damageStatus: "NONE",
  damageNotes: "",
  incidents: [],
  imageUrl: "",
  ...overrides,
});

describe("vehicle routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    process.env.JWT_SECRET = "test-secret";
  });

  it("blocks vehicle creation for viewer routes at the role middleware", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "viewer-1",
      email: "viewer@solicar.com",
      role: "VIEWER",
      companyId: "company-1",
      deletedAt: null,
    });

    const token = jwt.sign({ userId: "viewer-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("enforces subscription vehicle limits before creation", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-free",
      deletedAt: null,
    });
    prismaMock.company.findUnique.mockResolvedValue({
      id: "company-free",
    });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription-free",
      companyId: "company-free",
      plan: "FREE",
      status: "ACTIVE",
    });
    prismaMock.vehicle.count.mockResolvedValue(5);

    const token = jwt.sign({ userId: "manager-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send(buildVehiclePayload());

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("SUBSCRIPTION_LIMIT_EXCEEDED");
    expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
  });

  it("creates a vehicle and writes create history when capacity allows it", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-allow",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-allow",
      deletedAt: null,
    });
    prismaMock.company.findUnique.mockResolvedValue({
      id: "company-allow",
    });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription-allow",
      companyId: "company-allow",
      plan: "FREE",
      status: "ACTIVE",
    });
    prismaMock.vehicle.count.mockResolvedValue(2);
    prismaMock.vehicle.create.mockResolvedValue({
      id: "vehicle-create-1",
      companyId: "company-allow",
      vin: "SCDEMO12345678901",
      model: "BMW i4 eDrive40",
      status: "ACTIVE",
      damageStatus: "NONE",
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-create-1",
      companyId: "company-allow",
      vin: "SCDEMO12345678901",
      model: "BMW i4 eDrive40",
      status: "ACTIVE",
      damageStatus: "NONE",
      incidents: [],
      company: { id: "company-allow", name: "Acme Fleet" },
    });

    const token = jwt.sign({ userId: "manager-allow" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send(buildVehiclePayload());

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: "vehicle-create-1",
      companyId: "company-allow",
      status: "ACTIVE",
    });
    expect(prismaMock.vehicleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: "vehicle-create-1",
          actionType: "CREATE",
          changedById: "manager-allow",
        }),
      }),
    );
    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "VEHICLE_CREATE",
          entityId: "vehicle-create-1",
        }),
      }),
    );
  });

  it("creates a history entry when a vehicle is updated", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-2",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-1",
      companyId: "company-1",
      deletedAt: null,
      vin: "SCDEMO12345678901",
      status: "ACTIVE",
      model: "BMW i4 eDrive40",
      damageStatus: "NONE",
      hadPreviousAccidents: false,
      incidents: [],
    });
    prismaMock.vehicle.update.mockResolvedValue({
      id: "vehicle-1",
      companyId: "company-1",
      vin: "SCDEMO12345678901",
      status: "MAINTENANCE",
      model: "BMW i4 eDrive40",
      damageStatus: "NONE",
    });
    prismaMock.vehicle.findUnique.mockResolvedValueOnce({
      id: "vehicle-1",
      companyId: "company-1",
      deletedAt: null,
      vin: "SCDEMO12345678901",
      status: "ACTIVE",
      model: "BMW i4 eDrive40",
      damageStatus: "NONE",
      hadPreviousAccidents: false,
      incidents: [],
    }).mockResolvedValueOnce({
      id: "vehicle-1",
      companyId: "company-1",
      vin: "SCDEMO12345678901",
      status: "MAINTENANCE",
      model: "BMW i4 eDrive40",
      damageStatus: "NONE",
      incidents: [],
      company: { id: "company-1", name: "Fleet Partners" },
    } as any);

    const token = jwt.sign({ userId: "manager-2" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .put("/vehicles/vehicle-1")
      .set("Authorization", `Bearer ${token}`)
      .send(buildVehiclePayload({ status: "MAINTENANCE" }));

    expect(response.status).toBe(200);
    expect(prismaMock.vehicleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: "vehicle-1",
          actionType: "UPDATE",
          changedById: "manager-2",
        }),
      }),
    );
    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "VEHICLE_UPDATE",
          entityId: "vehicle-1",
        }),
      }),
    );
  });

  it("creates transfer history and audit logs for admin transfers", async () => {
    const targetCompanyId = "22222222-2222-4222-8222-222222222222";

    prismaMock.user.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@solicar.com",
      role: "ADMIN",
      companyId: "company-admin",
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-9",
      companyId: "company-source",
      deletedAt: null,
      vin: "SCDEMO99999999999",
      status: "ACTIVE",
      model: "Mercedes-Benz EQE 300",
    });
    prismaMock.company.findUnique.mockResolvedValue({
      id: targetCompanyId,
    });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription-pro",
      companyId: targetCompanyId,
      plan: "PRO",
      status: "ACTIVE",
    });
    prismaMock.vehicle.count.mockResolvedValue(12);
    prismaMock.vehicle.update.mockResolvedValue({
      id: "vehicle-9",
      companyId: "company-target",
      status: "TRANSFERRED",
    });

    const token = jwt.sign({ userId: "admin-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles/vehicle-9/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: targetCompanyId });

    expect(response.status).toBe(200);
    expect(prismaMock.vehicleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: "vehicle-9",
          actionType: "TRANSFER",
          changedById: "admin-1",
        }),
      }),
    );
    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "VEHICLE_TRANSFER",
          entityId: "vehicle-9",
        }),
      }),
    );
  });

  it("creates a vehicle with accident history and incident records", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-incident",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-incident",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.company.findUnique.mockResolvedValue({ id: "company-incident" });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription-incident",
      companyId: "company-incident",
      plan: "FREE",
      status: "ACTIVE",
    });
    prismaMock.vehicle.count.mockResolvedValue(1);
    prismaMock.vehicle.create.mockResolvedValue({
      id: "vehicle-incident-1",
      companyId: "company-incident",
      vin: "SCDEMO12345678901",
      model: "BMW i4 eDrive40",
      status: "ACTIVE",
      damageStatus: "REPORTED",
    });
    prismaMock.vehicleIncident.create.mockResolvedValue({
      id: "incident-1",
      title: "Rear bumper damage",
      description: "Rear bumper scratched during parking collision",
      status: "UNRESOLVED",
      occurredAt: new Date("2026-04-10T00:00:00.000Z"),
      repairedAt: null,
      repairNotes: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-incident-1",
      companyId: "company-incident",
      vin: "SCDEMO12345678901",
      model: "BMW i4 eDrive40",
      status: "ACTIVE",
      damageStatus: "REPORTED",
      hadPreviousAccidents: true,
      damageNotes: "Imported with known rear bumper damage",
      incidents: [
        {
          id: "incident-1",
          title: "Rear bumper damage",
          description: "Rear bumper scratched during parking collision",
          status: "UNRESOLVED",
          occurredAt: "2026-04-10T00:00:00.000Z",
          repairedAt: null,
          repairNotes: null,
        },
      ],
      company: { id: "company-incident", name: "Fleet Partners" },
    } as any);

    const token = jwt.sign({ userId: "manager-incident" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildVehiclePayload({
          hadPreviousAccidents: true,
          damageStatus: "REPORTED",
          damageNotes: "Imported with known rear bumper damage",
          incidents: [
            {
              title: "Rear bumper damage",
              description: "Rear bumper scratched during parking collision",
              status: "UNRESOLVED",
              occurredAt: "2026-04-10",
              repairedAt: "",
              repairNotes: "",
            },
          ],
        }),
      );

    expect(response.status).toBe(201);
    expect(prismaMock.vehicleIncident.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.vehicleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: "INCIDENT",
        }),
      }),
    );
  });

  it("adds a new incident to an existing vehicle", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-incident-edit",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique
      .mockResolvedValueOnce({
        id: "vehicle-incident-2",
        companyId: "company-1",
        deletedAt: null,
        vin: "SCDEMO12345678901",
        status: "ACTIVE",
        model: "BMW i4 eDrive40",
        damageStatus: "NONE",
        hadPreviousAccidents: false,
        incidents: [],
      } as any)
      .mockResolvedValueOnce({
        id: "vehicle-incident-2",
        companyId: "company-1",
        vin: "SCDEMO12345678901",
        status: "ACTIVE",
        model: "BMW i4 eDrive40",
        damageStatus: "REPORTED",
        hadPreviousAccidents: true,
        damageNotes: "Front bumper impact",
        incidents: [
          {
            id: "incident-new",
            title: "Front bumper impact",
            description: "Minor impact on the front bumper",
            status: "UNRESOLVED",
            occurredAt: "2026-04-10T00:00:00.000Z",
            repairedAt: null,
            repairNotes: null,
          },
        ],
        company: { id: "company-1", name: "Fleet Partners" },
      } as any);
    prismaMock.vehicle.update.mockResolvedValue({
      id: "vehicle-incident-2",
      companyId: "company-1",
      vin: "SCDEMO12345678901",
      status: "ACTIVE",
      model: "BMW i4 eDrive40",
      damageStatus: "REPORTED",
    });
    prismaMock.vehicleIncident.create.mockResolvedValue({
      id: "incident-new",
      title: "Front bumper impact",
      description: "Minor impact on the front bumper",
      status: "UNRESOLVED",
      occurredAt: new Date("2026-04-10T00:00:00.000Z"),
      repairedAt: null,
      repairNotes: null,
    });

    const token = jwt.sign({ userId: "manager-incident-edit" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .put("/vehicles/vehicle-incident-2")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildVehiclePayload({
          hadPreviousAccidents: true,
          damageStatus: "REPORTED",
          damageNotes: "Front bumper impact",
          incidents: [
            {
              title: "Front bumper impact",
              description: "Minor impact on the front bumper",
              status: "UNRESOLVED",
              occurredAt: "2026-04-10",
              repairedAt: "",
              repairNotes: "",
            },
          ],
        }),
      );

    expect(response.status).toBe(200);
    expect(prismaMock.vehicleIncident.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.vehicleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: "INCIDENT",
        }),
      }),
    );
    expect(response.body.data.incidents).toHaveLength(1);
  });

  it("returns incidents in vehicle detail and history responses", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "viewer-incident",
      email: "viewer@solicar.com",
      role: "VIEWER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });

    const token = jwt.sign({ userId: "viewer-incident" }, process.env.JWT_SECRET!);

    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-incident-3",
      companyId: "company-1",
      deletedAt: null,
      model: "BMW i4 eDrive40",
      plate: "B-SC-1001",
      vin: "SCDEMO12345678901",
      status: "ACTIVE",
      damageStatus: "UNDER_REPAIR",
      hadPreviousAccidents: true,
      damageNotes: "Repair in progress",
      incidents: [
        {
          id: "incident-3",
          title: "Door dent",
          description: "Dent on rear left door",
          status: "UNRESOLVED",
          occurredAt: "2026-04-09T00:00:00.000Z",
          repairedAt: null,
          repairNotes: null,
        },
      ],
      company: { id: "company-1", name: "Fleet Partners" },
    } as any);

    const detailResponse = await request(app)
      .get("/vehicles/vehicle-incident-3")
      .set("Authorization", `Bearer ${token}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.incidents).toHaveLength(1);

    prismaMock.vehicleHistory.findMany.mockResolvedValue([
      {
        id: "history-incident-3",
        actionType: "INCIDENT",
        changedBy: { email: "manager@solicar.com" },
        oldData: null,
        newData: {
          incident: {
            title: "Door dent",
            status: "UNRESOLVED",
          },
        },
        timestamp: "2026-04-10T10:00:00.000Z",
      },
    ]);

    const historyResponse = await request(app)
      .get("/vehicles/vehicle-incident-3/history")
      .set("Authorization", `Bearer ${token}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.data[0].actionType).toBe("INCIDENT");
  });

  it("preserves incident data during transfer", async () => {
    const targetCompanyId = "33333333-3333-4333-8333-333333333333";

    prismaMock.user.findUnique.mockResolvedValue({
      id: "admin-transfer-incident",
      email: "admin@solicar.com",
      role: "ADMIN",
      companyId: "company-source",
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-transfer-incident",
      companyId: "company-source",
      deletedAt: null,
      vin: "SCDEMO99999999999",
      status: "ACTIVE",
      model: "Mercedes-Benz EQE 300",
      incidents: [
        {
          id: "incident-keep",
          title: "Mirror scratch",
          status: "UNRESOLVED",
        },
      ],
    } as any);
    prismaMock.company.findUnique.mockResolvedValue({ id: targetCompanyId });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription-pro",
      companyId: targetCompanyId,
      plan: "PRO",
      status: "ACTIVE",
    });
    prismaMock.vehicle.count.mockResolvedValue(2);
    prismaMock.vehicle.update.mockResolvedValue({
      id: "vehicle-transfer-incident",
      companyId: targetCompanyId,
      status: "TRANSFERRED",
    });

    const token = jwt.sign({ userId: "admin-transfer-incident" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles/vehicle-transfer-incident/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: targetCompanyId });

    expect(response.status).toBe(200);
    expect(prismaMock.vehicleIncident.create).not.toHaveBeenCalled();
    expect(prismaMock.vehicleIncident.update).not.toHaveBeenCalled();
  });

  it("uploads a vehicle document for an authorized user and records audit history", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-doc-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-doc-1",
      model: "BMW i4 eDrive40",
      companyId: "company-1",
      deletedAt: null,
    });
    prismaMock.vehicleDocument.create.mockResolvedValue({
      id: "document-1",
      vehicleId: "vehicle-doc-1",
      incidentId: null,
      title: "Registration certificate",
      documentType: "REGISTRATION",
      originalName: "registration.pdf",
      storagePath: "/uploads/vehicle-documents/registration.pdf",
      mimeType: "application/pdf",
      sizeBytes: 24,
      expiryDate: new Date("2026-12-01T00:00:00.000Z"),
      uploadedBy: {
        id: "manager-doc-1",
        email: "manager@solicar.com",
      },
    });

    const token = jwt.sign({ userId: "manager-doc-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles/vehicle-doc-1/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Registration certificate")
      .field("documentType", "REGISTRATION")
      .field("expiryDate", "2026-12-01")
      .attach("file", Buffer.from("demo registration file"), "registration.pdf");

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: "document-1",
      vehicleId: "vehicle-doc-1",
      documentType: "REGISTRATION",
    });
    expect(prismaMock.vehicleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: "vehicle-doc-1",
          actionType: "DOCUMENT",
          changedById: "manager-doc-1",
        }),
      }),
    );
    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "VEHICLE_DOCUMENT_UPLOAD",
          entityId: "document-1",
        }),
      }),
    );
  });

  it("rejects invalid vehicle document file types before persistence", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-doc-invalid",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-doc-invalid",
      model: "BMW i4 eDrive40",
      companyId: "company-1",
      deletedAt: null,
    });

    const token = jwt.sign({ userId: "manager-doc-invalid" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles/vehicle-doc-invalid/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Executable upload")
      .field("documentType", "OTHER")
      .attach("file", Buffer.from("binary"), {
        filename: "payload.exe",
        contentType: "application/x-msdownload",
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(prismaMock.vehicleDocument.create).not.toHaveBeenCalled();
  });

  it("prevents document access across company boundaries", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-doc-2",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicleDocument.findUnique.mockResolvedValue({
      id: "document-foreign",
      storagePath: "/uploads/vehicle-documents/foreign.pdf",
      originalName: "foreign.pdf",
      vehicle: {
        id: "vehicle-foreign",
        model: "Audi Q4 e-tron",
        companyId: "company-2",
        deletedAt: null,
      },
    });

    const token = jwt.sign({ userId: "manager-doc-2" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .get("/vehicles/documents/document-foreign/download")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("DOCUMENT_NOT_FOUND");
  });

  it("deletes a vehicle document when the acting user is authorized", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-doc-delete",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicleDocument.findFirst.mockResolvedValue({
      id: "document-delete-1",
      vehicleId: "vehicle-doc-1",
      incidentId: null,
      title: "Insurance policy",
      documentType: "INSURANCE",
      originalName: "insurance.pdf",
      storagePath: "/uploads/vehicle-documents/insurance.pdf",
      mimeType: "application/pdf",
      sizeBytes: 144,
      expiryDate: new Date("2026-07-01T00:00:00.000Z"),
      vehicle: {
        id: "vehicle-doc-1",
        companyId: "company-1",
        deletedAt: null,
      },
    });
    prismaMock.vehicleDocument.update.mockResolvedValue({
      id: "document-delete-1",
      archivedAt: new Date("2026-04-13T10:30:00.000Z"),
      archiveReason: null,
    });

    const token = jwt.sign({ userId: "manager-doc-delete" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .delete("/vehicles/vehicle-doc-1/documents/document-delete-1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(prismaMock.vehicleDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "document-delete-1" },
        data: expect.objectContaining({
          archivedAt: expect.any(Date),
          archivedByUserId: "manager-doc-delete",
        }),
      }),
    );
    expect(prismaMock.vehicleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: "vehicle-doc-1",
          actionType: "DOCUMENT",
          changedById: "manager-doc-delete",
        }),
      }),
    );
  });

  it("uploads an incident attachment and writes a document history event", async () => {
    const incidentId = "11111111-1111-4111-8111-111111111111";

    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-attachment-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-attachment-1",
      companyId: "company-1",
      deletedAt: null,
    });
    prismaMock.vehicleIncident.findFirst.mockResolvedValue({
      id: incidentId,
    });
    prismaMock.vehicleDocument.create.mockResolvedValue({
      id: "attachment-1",
      vehicleId: "vehicle-attachment-1",
      incidentId,
      title: "Damage photo",
      documentType: "INCIDENT",
      originalName: "damage.png",
      storagePath: "/uploads/vehicle-documents/damage.png",
      mimeType: "image/png",
      sizeBytes: 48,
      expiryDate: null,
      uploadedBy: {
        id: "manager-attachment-1",
        email: "manager@solicar.com",
      },
    });

    const token = jwt.sign({ userId: "manager-attachment-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post(`/vehicles/vehicle-attachment-1/incidents/${incidentId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Damage photo")
      .attach("file", Buffer.from("image-bytes"), {
        filename: "damage.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: "attachment-1",
      incidentId,
      documentType: "INCIDENT",
    });
    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "INCIDENT_ATTACHMENT_UPLOAD",
          entityId: "attachment-1",
        }),
      }),
    );
  });

  it("blocks incident attachment uploads outside the user's company scope", async () => {
    const foreignIncidentId = "22222222-2222-4222-8222-222222222222";

    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-attachment-2",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-foreign-attachment",
      companyId: "company-2",
      deletedAt: null,
    });

    const token = jwt.sign({ userId: "manager-attachment-2" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post(`/vehicles/vehicle-foreign-attachment/incidents/${foreignIncidentId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Unauthorized file")
      .attach("file", Buffer.from("image-bytes"), {
        filename: "foreign.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("VEHICLE_NOT_FOUND");
  });

  it("creates a maintenance record and logs the maintenance event", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-maint-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-maint-1",
      companyId: "company-1",
      deletedAt: null,
    });
    prismaMock.vehicleMaintenanceRecord.create.mockResolvedValue({
      id: "maintenance-1",
      vehicleId: "vehicle-maint-1",
      title: "Scheduled tire swap",
      description: "Seasonal tire swap and balance check.",
      status: "SCHEDULED",
      serviceDate: new Date("2026-04-20T00:00:00.000Z"),
      completedAt: null,
      cost: 220,
      vendor: "Berlin Wheels",
      mileage: 19400,
      reminderDate: new Date("2026-04-18T00:00:00.000Z"),
      createdBy: {
        id: "manager-maint-1",
        email: "manager@solicar.com",
      },
      updatedBy: {
        id: "manager-maint-1",
        email: "manager@solicar.com",
      },
    });

    const token = jwt.sign({ userId: "manager-maint-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles/vehicle-maint-1/maintenance")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Scheduled tire swap",
        description: "Seasonal tire swap and balance check.",
        status: "SCHEDULED",
        serviceDate: "2026-04-20",
        cost: "220",
        vendor: "Berlin Wheels",
        mileage: 19400,
        reminderDate: "2026-04-18",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: "maintenance-1",
      vehicleId: "vehicle-maint-1",
      status: "SCHEDULED",
    });
    expect(prismaMock.vehicleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: "vehicle-maint-1",
          actionType: "MAINTENANCE",
          changedById: "manager-maint-1",
        }),
      }),
    );
    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "VEHICLE_MAINTENANCE_CREATE",
          entityId: "maintenance-1",
        }),
      }),
    );
  });

  it("returns maintenance records in the vehicle detail payload", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "viewer-maint-1",
      email: "viewer@solicar.com",
      role: "VIEWER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-maint-detail",
      companyId: "company-1",
      deletedAt: null,
      model: "Tesla Model Y Long Range",
      plate: "B-SC-5005",
      vin: "SCDEMO00000000005",
      status: "MAINTENANCE",
      damageStatus: "UNDER_REPAIR",
      hadPreviousAccidents: true,
      damageNotes: "Charging-port housing under repair",
      incidents: [],
      documents: [],
      maintenanceRecords: [
        {
          id: "maintenance-detail-1",
          vehicleId: "vehicle-maint-detail",
          title: "Charging-port housing replacement",
          description: "Active service slot",
          status: "IN_PROGRESS",
          serviceDate: "2026-04-14T00:00:00.000Z",
          completedAt: null,
          cost: 1280,
          vendor: "Tesla Service Hannover",
          mileage: 35540,
          reminderDate: "2026-04-13T00:00:00.000Z",
          createdAt: "2026-04-11T09:00:00.000Z",
          updatedAt: "2026-04-11T09:00:00.000Z",
          createdBy: { id: "admin-1", email: "admin@solicar.com" },
          updatedBy: { id: "admin-1", email: "admin@solicar.com" },
        },
      ],
      company: { id: "company-1", name: "Fleet Partners" },
    } as any);

    const token = jwt.sign({ userId: "viewer-maint-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .get("/vehicles/vehicle-maint-detail")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.maintenanceRecords).toHaveLength(1);
    expect(response.body.data.maintenanceRecords[0].title).toBe("Charging-port housing replacement");
  });

  it("blocks viewers from modifying maintenance records", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "viewer-maint-2",
      email: "viewer@solicar.com",
      role: "VIEWER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });

    const token = jwt.sign({ userId: "viewer-maint-2" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles/vehicle-maint-blocked/maintenance")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Unauthorized maintenance change",
        status: "SCHEDULED",
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("preserves incidents, maintenance, and documents when a transferred vehicle is opened by the new company", async () => {
    const targetCompanyId = "44444444-4444-4444-8444-444444444444";

    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: "platform-admin-transfer-assets",
        email: "admin@solicar.com",
        role: "ADMIN",
        companyId: "company-source",
        isPlatformAdmin: true,
        registrationType: "COMPANY",
        deletedAt: null,
      })
      .mockResolvedValueOnce({
        id: "manager-target-assets",
        email: "manager@fleetpartners.com",
        role: "MANAGER",
        companyId: targetCompanyId,
        isPlatformAdmin: false,
        registrationType: "COMPANY",
        deletedAt: null,
      });
    prismaMock.vehicle.findUnique
      .mockResolvedValueOnce({
        id: "vehicle-transfer-assets",
        companyId: "company-source",
        deletedAt: null,
        vin: "SCDEMO77777777777",
        status: "ACTIVE",
        model: "Audi Q4 e-tron",
      })
      .mockResolvedValueOnce({
        id: "vehicle-transfer-assets",
        companyId: targetCompanyId,
        deletedAt: null,
        vin: "SCDEMO77777777777",
        plate: "HH-SC-4401",
        model: "Audi Q4 e-tron",
        status: "TRANSFERRED",
        damageStatus: "REPORTED",
        hadPreviousAccidents: true,
        damageNotes: "Front-left damage remains under workshop review",
        incidents: [
          {
            id: "incident-preserved-1",
            title: "Front-left body damage",
            description: "Workshop review pending",
            status: "UNRESOLVED",
            occurredAt: "2026-04-10T00:00:00.000Z",
            repairedAt: null,
            repairNotes: null,
            attachments: [
              {
                id: "attachment-preserved-1",
                title: "Damage overview photo",
                originalName: "damage.png",
                documentType: "INCIDENT",
                sizeBytes: 88,
              },
            ],
          },
        ],
        documents: [
          {
            id: "document-preserved-1",
            title: "Transfer checklist",
            originalName: "transfer-checklist.pdf",
            documentType: "CONTRACT",
            sizeBytes: 144,
          },
        ],
        maintenanceRecords: [
          {
            id: "maintenance-preserved-1",
            title: "Damage assessment booking",
            status: "SCHEDULED",
            vendor: "Autohaus HafenCity",
            serviceDate: "2026-04-16T00:00:00.000Z",
          },
        ],
        company: { id: targetCompanyId, name: "Fleet Partners" },
      } as any);
    prismaMock.company.findUnique.mockResolvedValue({ id: targetCompanyId });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription-pro-assets",
      companyId: targetCompanyId,
      plan: "PRO",
      status: "ACTIVE",
    });
    prismaMock.vehicle.count.mockResolvedValue(3);
    prismaMock.vehicle.update.mockResolvedValue({
      id: "vehicle-transfer-assets",
      companyId: targetCompanyId,
      status: "TRANSFERRED",
    });

    const adminToken = jwt.sign({ userId: "platform-admin-transfer-assets" }, process.env.JWT_SECRET!);
    const targetToken = jwt.sign({ userId: "manager-target-assets" }, process.env.JWT_SECRET!);

    const transferResponse = await request(app)
      .post("/vehicles/vehicle-transfer-assets/transfer")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ companyId: targetCompanyId });

    expect(transferResponse.status).toBe(200);

    const detailResponse = await request(app)
      .get("/vehicles/vehicle-transfer-assets")
      .set("Authorization", `Bearer ${targetToken}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.incidents).toHaveLength(1);
    expect(detailResponse.body.data.documents).toHaveLength(1);
    expect(detailResponse.body.data.maintenanceRecords).toHaveLength(1);
  });

  it("archives a vehicle, hides it from active operations, and records lifecycle history", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-archive-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "manager-peer-1",
        email: "peer@solicar.com",
        companyId: "company-1",
        role: "MANAGER",
        isPlatformAdmin: false,
      },
    ]);
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-archive-1",
      companyId: "company-1",
      deletedAt: null,
      archivedAt: null,
      vin: "SCDEMOARCHIVE0001",
      model: "Tesla Model 3",
      status: "ACTIVE",
    });
    prismaMock.vehicle.update.mockResolvedValue({
      id: "vehicle-archive-1",
      companyId: "company-1",
      status: "ARCHIVED",
      archivedAt: new Date("2026-04-13T10:00:00.000Z"),
      archiveReason: "Stored for seasonal pause",
    });

    const token = jwt.sign({ userId: "manager-archive-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles/vehicle-archive-1/archive")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Stored for seasonal pause" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: "vehicle-archive-1",
      status: "ARCHIVED",
    });
    expect(prismaMock.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "vehicle-archive-1" },
        data: expect.objectContaining({
          status: "ARCHIVED",
          archivedAt: expect.any(Date),
          archivedByUserId: "manager-archive-1",
        }),
      }),
    );
    expect(prismaMock.vehicleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: "vehicle-archive-1",
          actionType: "ARCHIVE",
          changedById: "manager-archive-1",
        }),
      }),
    );
    expect(prismaMock.appNotification.create).toHaveBeenCalled();
  });

  it("restores an archived vehicle and clears archived state", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-restore-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "manager-peer-2",
        email: "peer2@solicar.com",
        companyId: "company-1",
        role: "MANAGER",
        isPlatformAdmin: false,
      },
    ]);
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-restore-1",
      companyId: "company-1",
      deletedAt: new Date("2026-04-10T10:00:00.000Z"),
      archivedAt: new Date("2026-04-10T10:00:00.000Z"),
      archiveReason: "Stored for seasonal pause",
      vin: "SCDEMORESTORE0001",
      model: "Audi Q4 e-tron",
      status: "ARCHIVED",
    });
    prismaMock.vehicle.update.mockResolvedValue({
      id: "vehicle-restore-1",
      companyId: "company-1",
      status: "ACTIVE",
      archivedAt: null,
      archiveReason: null,
    });

    const token = jwt.sign({ userId: "manager-restore-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/vehicles/vehicle-restore-1/restore")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "ACTIVE" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: "vehicle-restore-1",
      status: "ACTIVE",
      archivedAt: null,
    });
    expect(prismaMock.vehicleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: "vehicle-restore-1",
          actionType: "RESTORE",
          changedById: "manager-restore-1",
        }),
      }),
    );
  });

  it("filters archived vehicles out of the default list and includes them in archived view", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "viewer-archive-scope",
      email: "viewer@solicar.com",
      role: "VIEWER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.count.mockResolvedValue(0);
    prismaMock.vehicle.findMany.mockResolvedValue([]);

    const token = jwt.sign({ userId: "viewer-archive-scope" }, process.env.JWT_SECRET!);

    const activeResponse = await request(app)
      .get("/vehicles")
      .set("Authorization", `Bearer ${token}`);

    expect(activeResponse.status).toBe(200);
    expect(prismaMock.vehicle.count).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: "company-1",
          archivedAt: null,
          deletedAt: null,
          status: { not: "ARCHIVED" },
        }),
      }),
    );

    const archivedResponse = await request(app)
      .get("/vehicles?archived=archived")
      .set("Authorization", `Bearer ${token}`);

    expect(archivedResponse.status).toBe(200);
    expect(prismaMock.vehicle.count).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: "company-1",
          OR: [
            { archivedAt: { not: null } },
            { deletedAt: { not: null } },
            { status: "ARCHIVED" },
          ],
        }),
      }),
    );
  });

  it("blocks invalid lifecycle transitions", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "manager-status-1",
      email: "manager@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      deletedAt: null,
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: "vehicle-status-1",
      companyId: "company-1",
      deletedAt: null,
      archivedAt: null,
      vin: "SCDEMOSTATUS0001",
      model: "Mercedes EQE",
      status: "SOLD",
    });

    const token = jwt.sign({ userId: "manager-status-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .patch("/vehicles/vehicle-status-1/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "UNDER_REPAIR" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_VEHICLE_STATUS_TRANSITION");
    expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
  });
});
