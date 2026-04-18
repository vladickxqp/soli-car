import { ActionType, Prisma, SystemEntityType } from "@prisma/client";
import { NextFunction, Response, Router } from "express";
import multer from "multer";
import XLSX from "xlsx";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate, requireManagerOrAdmin } from "../middleware/auth.js";
import { assertVehicleCapacity } from "../services/billing.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";

const router = Router();
const ALLOWED_IMPORT_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const lowerName = file.originalname.toLowerCase();
    const hasSupportedExtension = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");

    if (!ALLOWED_IMPORT_MIME_TYPES.has(file.mimetype) && !hasSupportedExtension) {
      callback(new Error("Unsupported import file type"));
      return;
    }

    callback(null, true);
  },
});

const isMeaningfulRow = (row: Record<string, string>) =>
  Object.values(row).some((value) => String(value ?? "").trim().length > 0);

const parseDateValue = (value: unknown) => {
  const fallback = new Date().toISOString();
  const candidate = typeof value === "string" || typeof value === "number" ? value : fallback;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
};

const toHistoryJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

router.post("/import", authenticate, requireManagerOrAdmin, upload.single("file"), async (req: AuthRequest & { file?: Express.Multer.File }, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        code: "FILE_UPLOAD_REQUIRED",
        message: "File upload required",
      });
    }

    const requestedCompanyId =
      req.user!.isPlatformAdmin && typeof req.body.companyId === "string" && req.body.companyId
        ? req.body.companyId
        : req.user!.companyId;

    const targetCompany = await prisma.company.findUnique({
      where: { id: requestedCompanyId },
      select: { id: true },
    });

    if (!targetCompany) {
      return res.status(400).json({
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" }).filter(isMeaningfulRow);

    if (rows.length === 0) {
      return res.status(400).json({
        code: "IMPORT_EMPTY_FILE",
        message: "The uploaded file does not contain any vehicle rows",
      });
    }

    await assertVehicleCapacity(prisma, requestedCompanyId, rows.length);

    const mapped = rows.map((row) => ({
      companyId: requestedCompanyId,
      model: row.Model ?? row.model ?? "",
      firstRegistration: parseDateValue(row.FirstRegistration ?? row.firstRegistration),
      vin: row.VIN ?? row.vin ?? "",
      hsn: row.HSN ?? row.hsn ?? "",
      tsn: row.TSN ?? row.tsn ?? "",
      price: Number(row.Price ?? row.price ?? 0),
      tuvDate: parseDateValue(row.TUV ?? row.TuV ?? row.tuvDate ?? row.tuv),
      tireStorage: row.TireStorage ?? row.tireStorage ?? "",
      plate: row.Plate ?? row.plate ?? "",
      lastUpdate: parseDateValue(row.LastUpdate ?? row.lastUpdate ?? new Date().toISOString()),
      driver: row.Driver ?? row.driver ?? "",
      contractType: row.ContractType ?? row.contractType ?? "",
      contractValue: Number(row.ContractValue ?? row.contractValue ?? 0),
      interest: Number(row.Interest ?? row.interest ?? 0),
      contractStart: parseDateValue(row.ContractStart ?? row.contractStart),
      contractEnd: parseDateValue(row.ContractEnd ?? row.contractEnd),
      leasingPartner: row.LeasingPartner ?? row.leasingPartner ?? "",
      customerNumber: row.CustomerNumber ?? row.customerNumber ?? "",
      inventoryNumber: row.InventoryNumber ?? row.inventoryNumber ?? "",
      contractPartner: row.ContractPartner ?? row.contractPartner ?? "",
      billingFrom: parseDateValue(row.BillingFrom ?? row.billingFrom),
      leasingRate: Number(row.LeasingRate ?? row.leasingRate ?? 0),
      billedTo: parseDateValue(row.BilledTo ?? row.billedTo),
      insurancePartner: row.InsurancePartner ?? row.insurancePartner ?? "",
      insuranceNumber: row.InsuranceNumber ?? row.insuranceNumber ?? "",
      insuranceCost: Number(row.InsuranceCost ?? row.insuranceCost ?? 0),
      insuranceStart: parseDateValue(row.InsuranceStart ?? row.insuranceStart),
      insuranceEnd: parseDateValue(row.InsuranceEnd ?? row.insuranceEnd),
      mileage: Number(row.Mileage ?? row.mileage ?? 0),
      yearlyMileage: Number(row.YearlyMileage ?? row.yearlyMileage ?? 0),
      taxPerYear: Number(row.TaxPerYear ?? row.taxPerYear ?? 0),
      paymentDate: parseDateValue(row.PaymentDate ?? row.paymentDate),
      status: "ACTIVE" as const,
      hadPreviousAccidents: false,
      damageStatus: "NONE" as const,
      damageNotes: null,
      imageUrl: undefined,
    }));

    const created = await prisma.$transaction(async (tx) => {
      const vehicles = [];

      for (const record of mapped) {
        const vehicle = await tx.vehicle.create({ data: record });
        await tx.vehicleHistory.create({
          data: {
            vehicleId: vehicle.id,
            actionType: ActionType.CREATE,
            changedById: req.user!.id,
            oldData: Prisma.JsonNull,
            newData: toHistoryJson(record),
          },
        });
        vehicles.push(vehicle);
      }

      return vehicles;
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      action: "VEHICLE_IMPORT",
      entityType: SystemEntityType.COMPANY,
      entityId: requestedCompanyId,
      metadata: {
        companyId: requestedCompanyId,
        imported: created.length,
      },
    });

    res.status(201).json({
      data: {
        imported: created.length,
        vehicles: created,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
