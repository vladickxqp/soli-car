import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportVehiclePdf } from "./exportVehiclePdf";
import { Vehicle, VehicleHistory } from "../types";

const downloadMock = vi.fn();
const createPdfMock = vi.fn((documentDefinition: unknown) => ({
  download: (fileName: string) => downloadMock(fileName, documentDefinition),
}));
const addVirtualFileSystemMock = vi.fn();

vi.mock("pdfmake/build/pdfmake", () => ({
  default: {
    createPdf: createPdfMock,
    addVirtualFileSystem: addVirtualFileSystemMock,
  },
}));

vi.mock("pdfmake/build/vfs_fonts", () => ({
  default: {
    Roboto: {},
  },
}));

const translations: Record<string, string> = {
  "pdf.reportTitle": "Vehicle report",
  "pdf.reportSubtitle": "Enterprise fleet record",
  "pdf.sections.vehicle": "Vehicle overview",
  "pdf.sections.contract": "Contract and leasing",
  "pdf.sections.insurance": "Insurance and mileage",
  "pdf.sections.incidents": "Damage and incident summary",
  "pdf.sections.incidentTimeline": "Incident records",
  "pdf.sections.maintenance": "Maintenance summary",
  "pdf.sections.maintenanceTimeline": "Maintenance timeline",
  "pdf.sections.documents": "Document register",
  "pdf.sections.deadlines": "Upcoming deadlines",
  "pdf.sections.history": "Audit history",
  "notifications.types.TUV": "TUV",
  "notifications.types.INSURANCE": "Insurance",
  "notifications.types.CONTRACT": "Contract",
  "vehicle.company": "Company",
  "vehicle.status": "Status",
  "vehicle.damageStatus": "Damage status",
  "vehicle.hadPreviousAccidents": "Previous accidents",
  "vehicle.plate": "Plate",
  "vehicle.vin": "VIN",
  "vehicle.driver": "Driver",
  "vehicle.firstRegistration": "First registration",
  "vehicle.lastUpdate": "Last update",
  "vehicle.price": "Price",
  "vehicle.damageNotes": "Damage notes",
  "vehicle.incidentCount": "Incident count",
  "vehicle.contractType": "Contract type",
  "vehicle.contractValue": "Contract value",
  "vehicle.interest": "Interest",
  "vehicle.contractStart": "Contract start",
  "vehicle.contractEnd": "Contract end",
  "vehicle.leasingPartner": "Leasing partner",
  "vehicle.customerNumber": "Customer number",
  "vehicle.contractPartner": "Contract partner",
  "vehicle.billingFrom": "Billing from",
  "vehicle.billedTo": "Billed to",
  "vehicle.leasingRate": "Leasing rate",
  "vehicle.insurancePartner": "Insurance partner",
  "vehicle.insuranceNumber": "Insurance number",
  "vehicle.insuranceCost": "Insurance cost",
  "vehicle.insuranceStart": "Insurance start",
  "vehicle.insuranceEnd": "Insurance end",
  "vehicle.mileage": "Mileage",
  "vehicle.yearlyMileage": "Yearly mileage",
  "vehicle.taxPerYear": "Tax per year",
  "vehicle.paymentDate": "Payment date",
  "vehicle.repairNotes": "Repair notes",
  "vehicleDetails.incidentsEmptyDescription": "No incidents",
  "vehicleDetails.maintenance.emptyDescription": "No maintenance records",
  "vehicleDetails.documentsEmptyDescription": "No documents",
  "vehicleDetails.maintenance.summary.total": "Total records",
  "vehicleDetails.maintenance.summary.open": "Open maintenance",
  "vehicleDetails.maintenance.summary.totalCost": "Total maintenance cost",
  "vehicleDetails.maintenance.summary.nextReminder": "Next reminder",
  "vehicleDetails.documents.summary.total": "Total documents",
  "vehicleDetails.documents.summary.expiring": "Expiring documents",
  "vehicleDetails.documents.summary.withIncidents": "Incident attachments",
  "vehicleDetails.maintenance.status.COMPLETED": "Completed",
  "vehicleDetails.documents.types.REGISTRATION": "Registration",
  "vehicleDetails.documents.types.INCIDENT": "Incident attachment",
  "history.emptyDescription": "No history",
  "common.yes": "Yes",
  "common.no": "No",
  "status.ACTIVE": "Active",
  "damageStatus.REPAIRED": "Repaired",
  "incidentStatus.REPAIRED": "Repaired",
  "history.actions.INCIDENT": "Incident updated",
};

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === "units.kilometers") {
    return `${options?.value ?? ""} km`;
  }

  if (key === "notifications.dayLeft") {
    return "1 day left";
  }

  if (key === "notifications.daysLeft") {
    return `${options?.count ?? 0} days left`;
  }

  if (key === "notifications.expired") {
    return `${options?.count ?? 0} days overdue`;
  }

  return translations[key] ?? key;
};

const vehicle: Vehicle = {
  id: "vehicle-1",
  companyId: "company-1",
  company: { id: "company-1", name: "Fleet Partners" },
  model: "BMW i4 eDrive40",
  firstRegistration: "2025-01-05T00:00:00.000Z",
  vin: "WBA00000000000001",
  hsn: "0005",
  tsn: "ABC",
  price: 58990,
  tuvDate: "2026-05-01T00:00:00.000Z",
  tireStorage: "Berlin",
  plate: "B-SC-1001",
  lastUpdate: "2026-04-10T00:00:00.000Z",
  driver: "Alice Becker",
  contractType: "Operational Leasing",
  contractValue: 52900,
  interest: 3.1,
  contractStart: "2025-01-10T00:00:00.000Z",
  contractEnd: "2027-01-10T00:00:00.000Z",
  leasingPartner: "Mobility Lease Europe",
  customerNumber: "HQ-1001",
  inventoryNumber: "INV-1001",
  contractPartner: "Soli Car Contracts",
  billingFrom: "2025-01-10T00:00:00.000Z",
  leasingRate: 699,
  billedTo: "2027-01-10T00:00:00.000Z",
  insurancePartner: "Allianz Fleet",
  insuranceNumber: "INS-1001",
  insuranceCost: 1290,
  insuranceStart: "2025-01-10T00:00:00.000Z",
  insuranceEnd: "2026-12-01T00:00:00.000Z",
  mileage: 19350,
  yearlyMileage: 25000,
  taxPerYear: 0,
  paymentDate: "2026-04-30T00:00:00.000Z",
  status: "ACTIVE",
  hadPreviousAccidents: true,
  damageStatus: "REPAIRED",
  damageNotes: "Rear bumper damage repaired before onboarding.",
  imageUrl: null,
  latitude: null,
  longitude: null,
  lastLocationUpdate: null,
  incidents: [
    {
      id: "incident-1",
      title: "Rear bumper repair",
      description: "Historic collision fully repaired before the vehicle entered the fleet.",
      status: "REPAIRED",
      occurredAt: "2024-10-11T00:00:00.000Z",
      repairedAt: "2024-10-20T00:00:00.000Z",
      repairNotes: "Verified with workshop invoice.",
      attachments: [],
      createdAt: "2024-10-11T00:00:00.000Z",
      updatedAt: "2024-10-20T00:00:00.000Z",
    },
  ],
  documents: [
    {
      id: "document-1",
      vehicleId: "vehicle-1",
      incidentId: null,
      title: "Registration certificate",
      documentType: "REGISTRATION",
      originalName: "registration.pdf",
      storagePath: "/uploads/vehicle-documents/registration.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      expiryDate: "2026-11-01T00:00:00.000Z",
      createdAt: "2025-01-10T00:00:00.000Z",
      updatedAt: "2025-01-10T00:00:00.000Z",
      uploadedBy: {
        id: "user-1",
        email: "admin@solicar.com",
      },
    },
  ],
  maintenanceRecords: [
    {
      id: "maintenance-1",
      vehicleId: "vehicle-1",
      title: "Quarterly inspection",
      description: "Completed onboarding inspection.",
      status: "COMPLETED",
      serviceDate: "2025-02-05T00:00:00.000Z",
      completedAt: "2025-02-05T00:00:00.000Z",
      cost: 620,
      vendor: "Werkstatt Berlin Mitte",
      mileage: 15000,
      reminderDate: "2025-08-05T00:00:00.000Z",
      createdAt: "2025-02-01T00:00:00.000Z",
      updatedAt: "2025-02-05T00:00:00.000Z",
      createdBy: {
        id: "user-1",
        email: "admin@solicar.com",
      },
      updatedBy: {
        id: "user-1",
        email: "admin@solicar.com",
      },
    },
  ],
  createdAt: "2025-01-05T00:00:00.000Z",
  updatedAt: "2026-04-10T00:00:00.000Z",
};

const history: VehicleHistory[] = [
  {
    id: "history-1",
    actionType: "INCIDENT",
    changedBy: { email: "admin@solicar.com" },
    oldData: null,
    newData: {
      title: "Rear bumper repair",
      status: "REPAIRED",
    },
    timestamp: "2026-04-10T12:00:00.000Z",
  },
];

describe("exportVehiclePdf", () => {
  beforeEach(() => {
    createPdfMock.mockClear();
    downloadMock.mockClear();
    addVirtualFileSystemMock.mockClear();
  });

  it("includes incident-related content in the generated document and triggers download", async () => {
    await exportVehiclePdf({
      vehicle,
      history,
      t: t as never,
    });

    expect(addVirtualFileSystemMock).toHaveBeenCalled();
    expect(createPdfMock).toHaveBeenCalledTimes(1);
    expect(downloadMock).toHaveBeenCalledWith(
      "BMW_i4_eDrive40-B-SC-1001.pdf",
      expect.any(Object),
    );

    const documentDefinition = downloadMock.mock.calls[0][1];
    const serializedDocument = JSON.stringify(documentDefinition);

    expect(serializedDocument).toContain("Damage and incident summary");
    expect(serializedDocument).toContain("Incident records");
    expect(serializedDocument).toContain("Rear bumper repair");
    expect(serializedDocument).toContain("Historic collision fully repaired before the vehicle entered the fleet.");
    expect(serializedDocument).toContain("Repair notes: Verified with workshop invoice.");
    expect(serializedDocument).toContain("Maintenance summary");
    expect(serializedDocument).toContain("Maintenance timeline");
    expect(serializedDocument).toContain("Quarterly inspection");
    expect(serializedDocument).toContain("Document register");
    expect(serializedDocument).toContain("Registration certificate");
  });
});
