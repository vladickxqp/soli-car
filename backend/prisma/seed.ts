import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import {
  ActionType,
  ApprovalAction,
  ApprovalStatus,
  InvitationStatus,
  MaintenanceStatus,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  Prisma,
  PrismaClient,
  SystemEntityType,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  VehicleDocumentType,
  VehicleStatus,
} from "@prisma/client";

const prisma = new PrismaClient();
const vehicleUploadsDirectory = path.resolve(process.cwd(), "uploads", "vehicle-documents");

const demoIncidentImageBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pB4n1wAAAAASUVORK5CYII=",
  "base64",
);

const toHistoryJson = (value: unknown) => JSON.parse(JSON.stringify(value));
const hashPublicShareToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const addDays = (days: number) => {
  const value = new Date();
  value.setHours(10, 0, 0, 0);
  value.setDate(value.getDate() + days);
  return value;
};

const ensureDemoUpload = async (
  fileName: string,
  content: string | Buffer,
) => {
  await fs.mkdir(vehicleUploadsDirectory, { recursive: true });
  const absolutePath = path.join(vehicleUploadsDirectory, fileName);
  await fs.writeFile(absolutePath, content);
  return `/uploads/vehicle-documents/${fileName}`;
};

const demoCredentials = {
  admin: {
    email: "admin@solicar.com",
    password: "Admin1234!",
    role: "ADMIN" as const,
  },
  ownerAdmin: {
    email: "vladhrishyk@gmail.com",
    password: "25122007gv",
    role: "ADMIN" as const,
  },
  companyAdmin: {
    email: "companyadmin@solicar.com",
    password: "CompanyAdmin1234!",
    role: "ADMIN" as const,
  },
  manager: {
    email: "user@solicar.com",
    password: "User1234!",
    role: "MANAGER" as const,
  },
  viewer: {
    email: "viewer@solicar.com",
    password: "Viewer1234!",
    role: "VIEWER" as const,
  },
  individual: {
    email: "individual@solicar.com",
    password: "Individual1234!",
    role: "MANAGER" as const,
  },
};

const buildVehicleRecord = (overrides: {
  companyId: string;
  model: string;
  vin: string;
  plate: string;
  driver: string;
  status: VehicleStatus;
  mileage: number;
  yearlyMileage: number;
  price: number;
  contractValue: number;
  interest: number;
  leasingRate: number;
  insuranceCost: number;
  taxPerYear: number;
  firstRegistrationOffset: number;
  tuvOffset: number;
  contractStartOffset: number;
  contractEndOffset: number;
  billingFromOffset: number;
  billedToOffset: number;
  insuranceStartOffset: number;
  insuranceEndOffset: number;
  paymentDateOffset: number;
  lastUpdateOffset: number;
  hsn?: string;
  tsn?: string;
  contractType?: string;
  leasingPartner?: string;
  customerNumber?: string;
  inventoryNumber?: string;
  contractPartner?: string;
  insurancePartner?: string;
  insuranceNumber?: string;
  tireStorage?: string;
  imageUrl?: string | null;
  latitude?: number;
  longitude?: number;
  lastLocationUpdateOffset?: number;
  hadPreviousAccidents?: boolean;
  damageStatus?: "NONE" | "REPORTED" | "UNDER_REPAIR" | "REPAIRED";
  damageNotes?: string | null;
  archivedAtOffset?: number;
  archivedByUserId?: string | null;
  archiveReason?: string | null;
}) => ({
  companyId: overrides.companyId,
  model: overrides.model,
  firstRegistration: addDays(overrides.firstRegistrationOffset),
  vin: overrides.vin,
  hsn: overrides.hsn ?? "0005",
  tsn: overrides.tsn ?? "ABC",
  price: overrides.price,
  tuvDate: addDays(overrides.tuvOffset),
  tireStorage: overrides.tireStorage ?? "Berlin Main Depot",
  plate: overrides.plate,
  lastUpdate: addDays(overrides.lastUpdateOffset),
  driver: overrides.driver,
  contractType: overrides.contractType ?? "Operational Leasing",
  contractValue: overrides.contractValue,
  interest: overrides.interest,
  contractStart: addDays(overrides.contractStartOffset),
  contractEnd: addDays(overrides.contractEndOffset),
  leasingPartner: overrides.leasingPartner ?? "Mobility Lease Europe",
  customerNumber: overrides.customerNumber ?? `CUST-${overrides.vin.slice(-4)}`,
  inventoryNumber: overrides.inventoryNumber ?? `INV-${overrides.vin.slice(-4)}`,
  contractPartner: overrides.contractPartner ?? "Soli Car Contracts",
  billingFrom: addDays(overrides.billingFromOffset),
  leasingRate: overrides.leasingRate,
  billedTo: addDays(overrides.billedToOffset),
  insurancePartner: overrides.insurancePartner ?? "Allianz Fleet",
  insuranceNumber: overrides.insuranceNumber ?? `INS-${overrides.vin.slice(-6)}`,
  insuranceCost: overrides.insuranceCost,
  insuranceStart: addDays(overrides.insuranceStartOffset),
  insuranceEnd: addDays(overrides.insuranceEndOffset),
  mileage: overrides.mileage,
  yearlyMileage: overrides.yearlyMileage,
  taxPerYear: overrides.taxPerYear,
  paymentDate: addDays(overrides.paymentDateOffset),
  status: overrides.status,
  hadPreviousAccidents: overrides.hadPreviousAccidents ?? false,
  damageStatus: overrides.damageStatus ?? "NONE",
  damageNotes: overrides.damageNotes ?? null,
  imageUrl: overrides.imageUrl ?? null,
  latitude: overrides.latitude ?? null,
  longitude: overrides.longitude ?? null,
  lastLocationUpdate:
    typeof overrides.lastLocationUpdateOffset === "number"
      ? addDays(overrides.lastLocationUpdateOffset)
      : null,
  archivedAt:
    typeof overrides.archivedAtOffset === "number"
      ? addDays(overrides.archivedAtOffset)
      : null,
  archivedByUserId: overrides.archivedByUserId ?? null,
  archiveReason: overrides.archiveReason ?? null,
  deletedAt: null,
});

async function main() {
  const temporaryProspectUsers = await prisma.user.findMany({
    where: {
      email: {
        startsWith: "demo.verify.",
      },
    },
    select: {
      id: true,
    },
  });

  if (temporaryProspectUsers.length > 0) {
    await prisma.user.deleteMany({
      where: {
        id: {
          in: temporaryProspectUsers.map((user) => user.id),
        },
      },
    });
  }

  const staleCompanies = await prisma.company.findMany({
    where: {
      OR: [
        { name: { startsWith: "Demo Prospect " } },
        { name: { startsWith: "Smoke Fleet " } },
        { name: { startsWith: "QA Admin Company " } },
        { name: { startsWith: "Personal Workspace - " } },
        { name: "Verification Check GmbH" },
        { name: "Soli.car" },
      ],
    },
    select: {
      id: true,
    },
  });

  if (staleCompanies.length > 0) {
    const staleCompanyIds = staleCompanies.map((company) => company.id);
    const staleVehicles = await prisma.vehicle.findMany({
      where: {
        companyId: {
          in: staleCompanyIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (staleVehicles.length > 0) {
      await prisma.vehicleHistory.deleteMany({
        where: {
          vehicleId: {
            in: staleVehicles.map((vehicle) => vehicle.id),
          },
        },
      });
    }

    await prisma.supportTicket.deleteMany({
      where: {
        companyId: {
          in: staleCompanyIds,
        },
      },
    });

    await prisma.vehicle.deleteMany({
      where: {
        companyId: {
          in: staleCompanyIds,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        companyId: {
          in: staleCompanyIds,
        },
      },
    });

    await prisma.company.deleteMany({
      where: {
        id: {
          in: staleCompanyIds,
        },
      },
    });
  }

  const adminCompany = await prisma.company.upsert({
    where: { name: "Soli Car HQ" },
    update: {},
    create: { name: "Soli Car HQ" },
  });

  const userCompany = await prisma.company.upsert({
    where: { name: "Fleet Partners" },
    update: {},
    create: { name: "Fleet Partners" },
  });

  const individualCompany = await prisma.company.upsert({
    where: { name: "Individual Workspace" },
    update: {},
    create: { name: "Individual Workspace" },
  });

  const mobilityCompany = await prisma.company.upsert({
    where: { name: "Soli Mobility GmbH" },
    update: {},
    create: { name: "Soli Mobility GmbH" },
  });

  const logisticsCompany = await prisma.company.upsert({
    where: { name: "Urban Route Logistics" },
    update: {},
    create: { name: "Urban Route Logistics" },
  });

  const serviceCompany = await prisma.company.upsert({
    where: { name: "Nordic Service Hub" },
    update: {},
    create: { name: "Nordic Service Hub" },
  });

  await prisma.subscription.upsert({
    where: { companyId: adminCompany.id },
    update: {
      stripeCustomerId: "cus_mock_solicar_hq",
      stripeSubscriptionId: "sub_mock_solicar_hq",
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: addDays(30),
    },
    create: {
      companyId: adminCompany.id,
      stripeCustomerId: "cus_mock_solicar_hq",
      stripeSubscriptionId: "sub_mock_solicar_hq",
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: addDays(30),
    },
  });

  await prisma.subscription.upsert({
    where: { companyId: userCompany.id },
    update: {
      stripeCustomerId: "cus_mock_fleet_partners",
      stripeSubscriptionId: null,
      plan: "FREE",
      status: "ACTIVE",
      currentPeriodEnd: null,
    },
    create: {
      companyId: userCompany.id,
      stripeCustomerId: "cus_mock_fleet_partners",
      stripeSubscriptionId: null,
      plan: "FREE",
      status: "ACTIVE",
      currentPeriodEnd: null,
    },
  });

  await prisma.subscription.upsert({
    where: { companyId: individualCompany.id },
    update: {
      stripeCustomerId: "cus_mock_individual_workspace",
      stripeSubscriptionId: null,
      plan: "FREE",
      status: "ACTIVE",
      currentPeriodEnd: null,
    },
    create: {
      companyId: individualCompany.id,
      stripeCustomerId: "cus_mock_individual_workspace",
      stripeSubscriptionId: null,
      plan: "FREE",
      status: "ACTIVE",
      currentPeriodEnd: null,
    },
  });

  await prisma.subscription.upsert({
    where: { companyId: mobilityCompany.id },
    update: {
      stripeCustomerId: "cus_mock_soli_mobility",
      stripeSubscriptionId: "sub_mock_soli_mobility",
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: addDays(30),
    },
    create: {
      companyId: mobilityCompany.id,
      stripeCustomerId: "cus_mock_soli_mobility",
      stripeSubscriptionId: "sub_mock_soli_mobility",
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: addDays(30),
    },
  });

  await prisma.subscription.upsert({
    where: { companyId: logisticsCompany.id },
    update: {
      stripeCustomerId: "cus_mock_urban_route",
      stripeSubscriptionId: "sub_mock_urban_route",
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: addDays(30),
    },
    create: {
      companyId: logisticsCompany.id,
      stripeCustomerId: "cus_mock_urban_route",
      stripeSubscriptionId: "sub_mock_urban_route",
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: addDays(30),
    },
  });

  await prisma.subscription.upsert({
    where: { companyId: serviceCompany.id },
    update: {
      stripeCustomerId: "cus_mock_nordic_service",
      stripeSubscriptionId: null,
      plan: "FREE",
      status: "ACTIVE",
      currentPeriodEnd: null,
    },
    create: {
      companyId: serviceCompany.id,
      stripeCustomerId: "cus_mock_nordic_service",
      stripeSubscriptionId: null,
      plan: "FREE",
      status: "ACTIVE",
      currentPeriodEnd: null,
    },
  });

  const adminPassword = await bcrypt.hash(demoCredentials.admin.password, 10);
  const ownerAdminPassword = await bcrypt.hash(demoCredentials.ownerAdmin.password, 10);
  const companyAdminPassword = await bcrypt.hash(demoCredentials.companyAdmin.password, 10);
  const managerPassword = await bcrypt.hash(demoCredentials.manager.password, 10);
  const viewerPassword = await bcrypt.hash(demoCredentials.viewer.password, 10);
  const individualPassword = await bcrypt.hash(demoCredentials.individual.password, 10);

  const adminUser = await prisma.user.upsert({
    where: { email: demoCredentials.admin.email },
    update: {
      password: adminPassword,
      role: demoCredentials.admin.role,
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      companyId: adminCompany.id,
      emailVerifiedAt: addDays(-60),
      onboardingCompletedAt: addDays(-58),
      deletedAt: null,
    },
    create: {
      email: demoCredentials.admin.email,
      password: adminPassword,
      role: demoCredentials.admin.role,
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      companyId: adminCompany.id,
      emailVerifiedAt: addDays(-60),
      onboardingCompletedAt: addDays(-58),
    },
  });

  const companyAdminUser = await prisma.user.upsert({
    where: { email: demoCredentials.companyAdmin.email },
    update: {
      password: companyAdminPassword,
      role: demoCredentials.companyAdmin.role,
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: userCompany.id,
      emailVerifiedAt: addDays(-42),
      onboardingCompletedAt: addDays(-40),
      deletedAt: null,
    },
    create: {
      email: demoCredentials.companyAdmin.email,
      password: companyAdminPassword,
      role: demoCredentials.companyAdmin.role,
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: userCompany.id,
      emailVerifiedAt: addDays(-42),
      onboardingCompletedAt: addDays(-40),
    },
  });

  const ownerAdminUser = await prisma.user.upsert({
    where: { email: demoCredentials.ownerAdmin.email },
    update: {
      password: ownerAdminPassword,
      role: demoCredentials.ownerAdmin.role,
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      companyId: adminCompany.id,
      emailVerifiedAt: addDays(-18),
      onboardingCompletedAt: addDays(-17),
      deletedAt: null,
    },
    create: {
      email: demoCredentials.ownerAdmin.email,
      password: ownerAdminPassword,
      role: demoCredentials.ownerAdmin.role,
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      companyId: adminCompany.id,
      emailVerifiedAt: addDays(-18),
      onboardingCompletedAt: addDays(-17),
    },
  });

  const managerUser = await prisma.user.upsert({
    where: { email: demoCredentials.manager.email },
    update: {
      password: managerPassword,
      role: demoCredentials.manager.role,
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: userCompany.id,
      emailVerifiedAt: addDays(-35),
      onboardingCompletedAt: addDays(-34),
      deletedAt: null,
    },
    create: {
      email: demoCredentials.manager.email,
      password: managerPassword,
      role: demoCredentials.manager.role,
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: userCompany.id,
      emailVerifiedAt: addDays(-35),
      onboardingCompletedAt: addDays(-34),
    },
  });

  const viewerUser = await prisma.user.upsert({
    where: { email: demoCredentials.viewer.email },
    update: {
      password: viewerPassword,
      role: demoCredentials.viewer.role,
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: userCompany.id,
      emailVerifiedAt: addDays(-28),
      onboardingCompletedAt: addDays(-27),
      deletedAt: null,
    },
    create: {
      email: demoCredentials.viewer.email,
      password: viewerPassword,
      role: demoCredentials.viewer.role,
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: userCompany.id,
      emailVerifiedAt: addDays(-28),
      onboardingCompletedAt: addDays(-27),
    },
  });

  const individualUser = await prisma.user.upsert({
    where: { email: demoCredentials.individual.email },
    update: {
      password: individualPassword,
      role: demoCredentials.individual.role,
      isPlatformAdmin: false,
      registrationType: "INDIVIDUAL",
      companyId: individualCompany.id,
      emailVerifiedAt: addDays(-21),
      onboardingCompletedAt: addDays(-20),
      deletedAt: null,
    },
    create: {
      email: demoCredentials.individual.email,
      password: individualPassword,
      role: demoCredentials.individual.role,
      isPlatformAdmin: false,
      registrationType: "INDIVIDUAL",
      companyId: individualCompany.id,
      emailVerifiedAt: addDays(-21),
      onboardingCompletedAt: addDays(-20),
    },
  });

  await prisma.user.upsert({
    where: { email: "mobility.ops@solicar.demo" },
    update: {
      password: managerPassword,
      role: "MANAGER",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: mobilityCompany.id,
      emailVerifiedAt: addDays(-16),
      onboardingCompletedAt: addDays(-15),
      deletedAt: null,
    },
    create: {
      email: "mobility.ops@solicar.demo",
      password: managerPassword,
      role: "MANAGER",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: mobilityCompany.id,
      emailVerifiedAt: addDays(-16),
      onboardingCompletedAt: addDays(-15),
    },
  });

  await prisma.user.upsert({
    where: { email: "route.dispatch@solicar.demo" },
    update: {
      password: managerPassword,
      role: "MANAGER",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: logisticsCompany.id,
      emailVerifiedAt: addDays(-14),
      onboardingCompletedAt: addDays(-13),
      deletedAt: null,
    },
    create: {
      email: "route.dispatch@solicar.demo",
      password: managerPassword,
      role: "MANAGER",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: logisticsCompany.id,
      emailVerifiedAt: addDays(-14),
      onboardingCompletedAt: addDays(-13),
    },
  });

  await prisma.user.upsert({
    where: { email: "service.nordic@solicar.demo" },
    update: {
      password: managerPassword,
      role: "MANAGER",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: serviceCompany.id,
      emailVerifiedAt: addDays(-12),
      onboardingCompletedAt: addDays(-11),
      deletedAt: null,
    },
    create: {
      email: "service.nordic@solicar.demo",
      password: managerPassword,
      role: "MANAGER",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      companyId: serviceCompany.id,
      emailVerifiedAt: addDays(-12),
      onboardingCompletedAt: addDays(-11),
    },
  });

  const demoCompanyIds = [
    adminCompany.id,
    userCompany.id,
    individualCompany.id,
    mobilityCompany.id,
    logisticsCompany.id,
    serviceCompany.id,
  ];

  await prisma.companyInvitation.deleteMany({
    where: {
      companyId: {
        in: [adminCompany.id, userCompany.id, individualCompany.id],
      },
    },
  });

  const pendingFleetInvitation = await prisma.companyInvitation.create({
    data: {
      companyId: userCompany.id,
      invitedById: companyAdminUser.id,
      email: "ops.newhire@fleetpartners.demo",
      role: "MANAGER",
      status: InvitationStatus.PENDING,
      tokenHash: "seed-company-invite-fleet-pending",
      expiresAt: addDays(7),
    },
  });

  const revokedAuditInvitation = await prisma.companyInvitation.create({
    data: {
      companyId: adminCompany.id,
      invitedById: adminUser.id,
      email: "audit.contractor@solicar.demo",
      role: "VIEWER",
      status: InvitationStatus.REVOKED,
      tokenHash: "seed-company-invite-admin-revoked",
      expiresAt: addDays(2),
      revokedAt: addDays(-1),
    },
  });

  const vehiclesToSeed = [
    buildVehicleRecord({
      companyId: adminCompany.id,
      model: "BMW i4 eDrive40",
      vin: "SCDEMO00000000001",
      plate: "B-SC-1001",
      driver: "Alice Becker",
      status: "ACTIVE",
      mileage: 19350,
      yearlyMileage: 25000,
      price: 58990,
      contractValue: 52900,
      interest: 3.1,
      leasingRate: 699,
      insuranceCost: 1290,
      taxPerYear: 0,
      firstRegistrationOffset: -400,
      tuvOffset: 14,
      contractStartOffset: -390,
      contractEndOffset: 160,
      billingFromOffset: -390,
      billedToOffset: 160,
      insuranceStartOffset: -380,
      insuranceEndOffset: 45,
      paymentDateOffset: 14,
      lastUpdateOffset: -2,
      customerNumber: "HQ-1001",
      inventoryNumber: "HQ-EV-1001",
      hadPreviousAccidents: true,
      damageStatus: "REPAIRED",
      damageNotes: "Rear bumper impact before onboarding. Repairs documented and completed.",
      latitude: 52.520008,
      longitude: 13.404954,
      lastLocationUpdateOffset: -1,
    }),
    buildVehicleRecord({
      companyId: userCompany.id,
      model: "Mercedes-Benz EQE 300",
      vin: "SCDEMO00000000002",
      plate: "M-FP-2201",
      driver: "Leon Ritter",
      status: "IN_LEASING",
      mileage: 42880,
      yearlyMileage: 30000,
      price: 74200,
      contractValue: 68800,
      interest: 3.8,
      leasingRate: 849,
      insuranceCost: 1480,
      taxPerYear: 0,
      firstRegistrationOffset: -510,
      tuvOffset: 26,
      contractStartOffset: -505,
      contractEndOffset: 25,
      billingFromOffset: -505,
      billedToOffset: 25,
      insuranceStartOffset: -365,
      insuranceEndOffset: 9,
      paymentDateOffset: 9,
      lastUpdateOffset: -1,
      customerNumber: "FP-2201",
      inventoryNumber: "FP-EV-2201",
      hadPreviousAccidents: false,
      damageStatus: "NONE",
      latitude: 48.135124,
      longitude: 11.581981,
      lastLocationUpdateOffset: 0,
    }),
    buildVehicleRecord({
      companyId: userCompany.id,
      model: "Volkswagen ID.4 Pro",
      vin: "SCDEMO00000000003",
      plate: "F-FP-3302",
      driver: "Archive Pool",
      status: "SOLD",
      mileage: 61240,
      yearlyMileage: 28000,
      price: 44900,
      contractValue: 40100,
      interest: 2.9,
      leasingRate: 529,
      insuranceCost: 990,
      taxPerYear: 0,
      firstRegistrationOffset: -720,
      tuvOffset: 75,
      contractStartOffset: -700,
      contractEndOffset: -18,
      billingFromOffset: -700,
      billedToOffset: -18,
      insuranceStartOffset: -365,
      insuranceEndOffset: 62,
      paymentDateOffset: 10,
      lastUpdateOffset: -8,
      customerNumber: "FP-3302",
      inventoryNumber: "FP-EV-3302",
      hadPreviousAccidents: true,
      damageStatus: "REPAIRED",
      damageNotes: "Historic door repair completed before resale.",
      latitude: 50.110924,
      longitude: 8.682127,
      lastLocationUpdateOffset: -12,
      archivedAtOffset: -12,
      archivedByUserId: companyAdminUser.id,
      archiveReason: "Sold and archived from active fleet operations after resale handover.",
    }),
    buildVehicleRecord({
      companyId: userCompany.id,
      model: "Audi Q4 e-tron",
      vin: "SCDEMO00000000004",
      plate: "HH-SC-4401",
      driver: "Julia Meyer",
      status: "TRANSFERRED",
      mileage: 28110,
      yearlyMileage: 24000,
      price: 56600,
      contractValue: 51250,
      interest: 3.2,
      leasingRate: 649,
      insuranceCost: 1180,
      taxPerYear: 0,
      firstRegistrationOffset: -460,
      tuvOffset: 18,
      contractStartOffset: -450,
      contractEndOffset: 110,
      billingFromOffset: -450,
      billedToOffset: 110,
      insuranceStartOffset: -365,
      insuranceEndOffset: 21,
      paymentDateOffset: 6,
      lastUpdateOffset: -6,
      customerNumber: "FP-4401",
      inventoryNumber: "FP-EV-4401",
      hadPreviousAccidents: true,
      damageStatus: "REPORTED",
      damageNotes: "Transfer completed while front-left damage assessment remained open.",
      latitude: 53.551086,
      longitude: 9.993682,
      lastLocationUpdateOffset: -2,
    }),
    buildVehicleRecord({
      companyId: adminCompany.id,
      model: "Tesla Model Y Long Range",
      vin: "SCDEMO00000000005",
      plate: "B-SC-5005",
      driver: "Niklas Hoffmann",
      status: "UNDER_REPAIR",
      mileage: 35540,
      yearlyMileage: 32000,
      price: 61200,
      contractValue: 55900,
      interest: 2.7,
      leasingRate: 739,
      insuranceCost: 1340,
      taxPerYear: 0,
      firstRegistrationOffset: -320,
      tuvOffset: -2,
      contractStartOffset: -315,
      contractEndOffset: 92,
      billingFromOffset: -315,
      billedToOffset: 92,
      insuranceStartOffset: -365,
      insuranceEndOffset: 28,
      paymentDateOffset: 5,
      lastUpdateOffset: -1,
      customerNumber: "HQ-5005",
      inventoryNumber: "HQ-EV-5005",
      hadPreviousAccidents: true,
      damageStatus: "UNDER_REPAIR",
      damageNotes: "Charging-port housing and front fascia currently under repair.",
      latitude: 52.375893,
      longitude: 9.73201,
      lastLocationUpdateOffset: -3,
    }),
    buildVehicleRecord({
      companyId: individualCompany.id,
      model: "Cupra Born",
      vin: "SCDEMO00000000006",
      plate: "I-IND-6001",
      driver: "Individual Workspace",
      status: "IN_SERVICE",
      mileage: 12420,
      yearlyMileage: 18000,
      price: 39800,
      contractValue: 36150,
      interest: 2.6,
      leasingRate: 459,
      insuranceCost: 910,
      taxPerYear: 0,
      firstRegistrationOffset: -180,
      tuvOffset: 190,
      contractStartOffset: -175,
      contractEndOffset: 420,
      billingFromOffset: -175,
      billedToOffset: 420,
      insuranceStartOffset: -175,
      insuranceEndOffset: 185,
      paymentDateOffset: 12,
      lastUpdateOffset: -3,
      customerNumber: "IND-6001",
      inventoryNumber: "IND-EV-6001",
      hadPreviousAccidents: false,
      damageStatus: "NONE",
      latitude: 51.339695,
      longitude: 12.373075,
      lastLocationUpdateOffset: -1,
    }),
    buildVehicleRecord({
      companyId: mobilityCompany.id,
      model: "Skoda Enyaq Coupe RS",
      vin: "SCDEMO00000000007",
      plate: "B-SM-7007",
      driver: "Carla Weiss",
      status: "ACTIVE",
      mileage: 26840,
      yearlyMileage: 22000,
      price: 54800,
      contractValue: 49900,
      interest: 3.0,
      leasingRate: 629,
      insuranceCost: 1170,
      taxPerYear: 0,
      firstRegistrationOffset: -260,
      tuvOffset: 88,
      contractStartOffset: -250,
      contractEndOffset: 210,
      billingFromOffset: -250,
      billedToOffset: 210,
      insuranceStartOffset: -250,
      insuranceEndOffset: 82,
      paymentDateOffset: 9,
      lastUpdateOffset: -2,
      customerNumber: "SM-7007",
      inventoryNumber: "SM-EV-7007",
      latitude: 52.5206,
      longitude: 13.3862,
      lastLocationUpdateOffset: -1,
    }),
    buildVehicleRecord({
      companyId: mobilityCompany.id,
      model: "Renault Megane E-Tech",
      vin: "SCDEMO00000000008",
      plate: "B-SM-7008",
      driver: "Marta Schulz",
      status: "ACTIVE",
      mileage: 15420,
      yearlyMileage: 18000,
      price: 41750,
      contractValue: 38900,
      interest: 2.8,
      leasingRate: 489,
      insuranceCost: 940,
      taxPerYear: 0,
      firstRegistrationOffset: -140,
      tuvOffset: 220,
      contractStartOffset: -135,
      contractEndOffset: 460,
      billingFromOffset: -135,
      billedToOffset: 460,
      insuranceStartOffset: -135,
      insuranceEndOffset: 145,
      paymentDateOffset: 11,
      lastUpdateOffset: -4,
      customerNumber: "SM-7008",
      inventoryNumber: "SM-EV-7008",
      latitude: 52.4974,
      longitude: 13.4285,
      lastLocationUpdateOffset: -2,
    }),
    buildVehicleRecord({
      companyId: logisticsCompany.id,
      model: "Ford Transit Custom",
      vin: "SCDEMO00000000009",
      plate: "HH-URL-9009",
      driver: "David Neumann",
      status: "ACTIVE",
      mileage: 70210,
      yearlyMileage: 36000,
      price: 43800,
      contractValue: 39500,
      interest: 4.1,
      leasingRate: 559,
      insuranceCost: 1380,
      taxPerYear: 240,
      firstRegistrationOffset: -640,
      tuvOffset: 11,
      contractStartOffset: -620,
      contractEndOffset: 60,
      billingFromOffset: -620,
      billedToOffset: 60,
      insuranceStartOffset: -365,
      insuranceEndOffset: 16,
      paymentDateOffset: 4,
      lastUpdateOffset: -1,
      customerNumber: "URL-9009",
      inventoryNumber: "URL-VAN-9009",
      latitude: 53.5488,
      longitude: 9.9872,
      lastLocationUpdateOffset: -1,
    }),
    buildVehicleRecord({
      companyId: serviceCompany.id,
      model: "BMW X3 xDrive30e",
      vin: "SCDEMO00000000010",
      plate: "K-NSH-1010",
      driver: "Jonas Keller",
      status: "MAINTENANCE",
      mileage: 38440,
      yearlyMileage: 26000,
      price: 61250,
      contractValue: 55800,
      interest: 3.4,
      leasingRate: 719,
      insuranceCost: 1280,
      taxPerYear: 210,
      firstRegistrationOffset: -410,
      tuvOffset: 34,
      contractStartOffset: -402,
      contractEndOffset: 130,
      billingFromOffset: -402,
      billedToOffset: 130,
      insuranceStartOffset: -365,
      insuranceEndOffset: 37,
      paymentDateOffset: 8,
      lastUpdateOffset: -2,
      customerNumber: "NSH-1010",
      inventoryNumber: "NSH-SUV-1010",
      latitude: 50.9375,
      longitude: 6.9603,
      lastLocationUpdateOffset: -3,
      hadPreviousAccidents: true,
      damageStatus: "UNDER_REPAIR",
      damageNotes: "Workshop diagnostics are active after a depot-side parking impact.",
    }),
  ];

  const seedVehicleVins = vehiclesToSeed.map((vehicle) => vehicle.vin);
  const extraDemoVehicles = await prisma.vehicle.findMany({
    where: {
      companyId: {
        in: demoCompanyIds,
      },
      vin: {
        notIn: seedVehicleVins,
      },
    },
    select: {
      id: true,
    },
  });
  const extraDemoVehicleIds = extraDemoVehicles.map((vehicle) => vehicle.id);

  if (extraDemoVehicleIds.length > 0) {
    await prisma.vehicleHistory.deleteMany({
      where: {
        vehicleId: {
          in: extraDemoVehicleIds,
        },
      },
    });

    await prisma.vehicle.deleteMany({
      where: {
        id: {
          in: extraDemoVehicleIds,
        },
      },
    });
  }

  const seededVehicles = [];
  for (const vehicle of vehiclesToSeed) {
    const savedVehicle = await prisma.vehicle.upsert({
      where: { vin: vehicle.vin },
      update: vehicle,
      create: vehicle,
    });
    seededVehicles.push(savedVehicle);
  }

  await prisma.vehicleHistory.deleteMany({
    where: {
      vehicleId: {
        in: seededVehicles.map((vehicle) => vehicle.id),
      },
    },
  });

  const vehicleByVin = Object.fromEntries(seededVehicles.map((vehicle) => [vehicle.vin, vehicle]));

  const bmwCurrent = vehicleByVin.SCDEMO00000000001;
  const eqeCurrent = vehicleByVin.SCDEMO00000000002;
  const id4Current = vehicleByVin.SCDEMO00000000003;
  const audiCurrent = vehicleByVin.SCDEMO00000000004;
  const teslaCurrent = vehicleByVin.SCDEMO00000000005;
  const individualCurrent = vehicleByVin.SCDEMO00000000006;

  await prisma.vehicleDocument.deleteMany({
    where: {
      vehicleId: {
        in: seededVehicles.map((vehicle) => vehicle.id),
      },
    },
  });

  await prisma.vehicleMaintenanceRecord.deleteMany({
    where: {
      vehicleId: {
        in: seededVehicles.map((vehicle) => vehicle.id),
      },
    },
  });

  await prisma.vehicleIncident.deleteMany({
    where: {
      vehicleId: {
        in: seededVehicles.map((vehicle) => vehicle.id),
      },
    },
  });

  const seededIncidents = await prisma.$transaction([
    prisma.vehicleIncident.create({
      data: {
        vehicleId: bmwCurrent.id,
        title: "Rear bumper repair before onboarding",
        description: "The vehicle entered the fleet with a documented rear bumper collision repair already completed by the previous holder.",
        status: "REPAIRED",
        occurredAt: addDays(-190),
        repairedAt: addDays(-176),
        repairNotes: "Repair invoice validated during intake.",
      },
    }),
    prisma.vehicleIncident.create({
      data: {
        vehicleId: audiCurrent.id,
        title: "Front-left body damage under review",
        description: "Transfer happened while front-left body and wheel-arch damage was still waiting for workshop confirmation.",
        status: "UNRESOLVED",
        occurredAt: addDays(-11),
        repairNotes: "Awaiting workshop quotation after transfer.",
      },
    }),
    prisma.vehicleIncident.create({
      data: {
        vehicleId: teslaCurrent.id,
        title: "Charging port housing replacement",
        description: "Charging-port housing and front fascia require an active repair slot after depot inspection.",
        status: "UNRESOLVED",
        occurredAt: addDays(-7),
        repairNotes: "Parts ordered and repair visit booked.",
      },
    }),
  ]);

  const [bmwIncident, audiIncident, teslaIncident] = seededIncidents;

  const [
    bmwRegistrationStoragePath,
    bmwInsuranceStoragePath,
    bmwContractStoragePath,
    bmwArchivedRiderStoragePath,
    teslaServiceStoragePath,
    audiIncidentAttachmentStoragePath,
    teslaIncidentAttachmentStoragePath,
  ] = await Promise.all([
    ensureDemoUpload(
      "seed-bmw-registration.txt",
      "Soli Car demo registration record for BMW i4 eDrive40 / B-SC-1001",
    ),
    ensureDemoUpload(
      "seed-bmw-insurance.txt",
      "Insurance renewal package for BMW i4 eDrive40. Expiry reminder intentionally near-term for dashboard demos.",
    ),
    ensureDemoUpload(
      "seed-bmw-contract.txt",
      "Contract summary for BMW i4 eDrive40 operational leasing agreement.",
    ),
    ensureDemoUpload(
      "seed-bmw-legacy-insurance-rider.txt",
      "Legacy insurance rider retained for audit purposes and archived after the renewal package was approved.",
    ),
    ensureDemoUpload(
      "seed-tesla-service.txt",
      "Service intake report for Tesla Model Y Long Range charging-port housing replacement.",
    ),
    ensureDemoUpload("seed-audi-incident.png", demoIncidentImageBuffer),
    ensureDemoUpload("seed-tesla-incident.png", demoIncidentImageBuffer),
  ]);

  const seededDocuments = await prisma.$transaction([
    prisma.vehicleDocument.create({
      data: {
        vehicleId: bmwCurrent.id,
        uploadedById: adminUser.id,
        title: "Vehicle registration certificate",
        documentType: VehicleDocumentType.REGISTRATION,
        originalName: "bmw-i4-registration.txt",
        storagePath: bmwRegistrationStoragePath,
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength("Soli Car demo registration record for BMW i4 eDrive40 / B-SC-1001"),
        expiryDate: null,
      },
    }),
    prisma.vehicleDocument.create({
      data: {
        vehicleId: bmwCurrent.id,
        uploadedById: adminUser.id,
        title: "Insurance renewal package",
        documentType: VehicleDocumentType.INSURANCE,
        originalName: "bmw-i4-insurance.txt",
        storagePath: bmwInsuranceStoragePath,
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength("Insurance renewal package for BMW i4 eDrive40. Expiry reminder intentionally near-term for dashboard demos."),
        expiryDate: addDays(18),
      },
    }),
    prisma.vehicleDocument.create({
      data: {
        vehicleId: bmwCurrent.id,
        uploadedById: adminUser.id,
        title: "Master leasing contract",
        documentType: VehicleDocumentType.CONTRACT,
        originalName: "bmw-i4-contract.txt",
        storagePath: bmwContractStoragePath,
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength("Contract summary for BMW i4 eDrive40 operational leasing agreement."),
        expiryDate: addDays(160),
      },
    }),
    prisma.vehicleDocument.create({
      data: {
        vehicleId: bmwCurrent.id,
        uploadedById: adminUser.id,
        title: "Legacy insurance rider",
        documentType: VehicleDocumentType.INSURANCE,
        originalName: "bmw-i4-legacy-rider.txt",
        storagePath: bmwArchivedRiderStoragePath,
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength("Legacy insurance rider retained for audit purposes and archived after the renewal package was approved."),
        expiryDate: addDays(-20),
        archivedAt: addDays(-14),
        archivedByUserId: adminUser.id,
        archiveReason: "Superseded by the current renewal package.",
      },
    }),
    prisma.vehicleDocument.create({
      data: {
        vehicleId: teslaCurrent.id,
        uploadedById: adminUser.id,
        title: "Service intake report",
        documentType: VehicleDocumentType.SERVICE,
        originalName: "tesla-service-intake.txt",
        storagePath: teslaServiceStoragePath,
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength("Service intake report for Tesla Model Y Long Range charging-port housing replacement."),
        expiryDate: addDays(45),
      },
    }),
    prisma.vehicleDocument.create({
      data: {
        vehicleId: audiCurrent.id,
        incidentId: audiIncident.id,
        uploadedById: companyAdminUser.id,
        title: "Front-left body damage photo",
        documentType: VehicleDocumentType.INCIDENT,
        originalName: "audi-q4-front-left-damage.png",
        storagePath: audiIncidentAttachmentStoragePath,
        mimeType: "image/png",
        sizeBytes: demoIncidentImageBuffer.byteLength,
        expiryDate: null,
      },
    }),
    prisma.vehicleDocument.create({
      data: {
        vehicleId: teslaCurrent.id,
        incidentId: teslaIncident.id,
        uploadedById: adminUser.id,
        title: "Charging-port housing inspection image",
        documentType: VehicleDocumentType.INCIDENT,
        originalName: "tesla-charging-port-inspection.png",
        storagePath: teslaIncidentAttachmentStoragePath,
        mimeType: "image/png",
        sizeBytes: demoIncidentImageBuffer.byteLength,
        expiryDate: null,
      },
    }),
  ]);

  const [
    bmwRegistrationDocument,
    bmwInsuranceDocument,
    bmwContractDocument,
    bmwArchivedRiderDocument,
    teslaServiceDocument,
    audiIncidentAttachment,
    teslaIncidentAttachment,
  ] = seededDocuments;

  const seededMaintenance = await prisma.$transaction([
    prisma.vehicleMaintenanceRecord.create({
      data: {
        vehicleId: bmwCurrent.id,
        createdById: adminUser.id,
        updatedById: adminUser.id,
        title: "Quarterly intake inspection",
        description: "Workshop intake inspection completed after onboarding and repair validation.",
        status: MaintenanceStatus.COMPLETED,
        serviceDate: addDays(-32),
        completedAt: addDays(-30),
        cost: 620,
        vendor: "Werkstatt Berlin Mitte",
        mileage: 18840,
        reminderDate: addDays(150),
      },
    }),
    prisma.vehicleMaintenanceRecord.create({
      data: {
        vehicleId: bmwCurrent.id,
        createdById: adminUser.id,
        updatedById: adminUser.id,
        title: "Legacy intake checklist draft",
        description: "Superseded draft checklist retained for audit completeness and archived after the validated inspection was published.",
        status: MaintenanceStatus.COMPLETED,
        serviceDate: addDays(-210),
        completedAt: addDays(-208),
        cost: 180,
        vendor: "Werkstatt Berlin Mitte",
        mileage: 11940,
        reminderDate: null,
        archivedAt: addDays(-180),
        archivedByUserId: adminUser.id,
        archiveReason: "Superseded by the validated quarterly intake inspection record.",
      },
    }),
    prisma.vehicleMaintenanceRecord.create({
      data: {
        vehicleId: teslaCurrent.id,
        createdById: adminUser.id,
        updatedById: adminUser.id,
        title: "Charging-port housing replacement",
        description: "Active workshop slot covering charging-port housing and front fascia alignment.",
        status: MaintenanceStatus.IN_PROGRESS,
        serviceDate: addDays(2),
        completedAt: null,
        cost: 1280,
        vendor: "Tesla Service Hannover",
        mileage: 35540,
        reminderDate: addDays(3),
      },
    }),
    prisma.vehicleMaintenanceRecord.create({
      data: {
        vehicleId: audiCurrent.id,
        createdById: companyAdminUser.id,
        updatedById: companyAdminUser.id,
        title: "Transfer-era damage assessment",
        description: "Workshop quotation requested after vehicle transfer to the Fleet Partners workspace.",
        status: MaintenanceStatus.SCHEDULED,
        serviceDate: addDays(5),
        completedAt: null,
        cost: 420,
        vendor: "Autohaus HafenCity",
        mileage: 28110,
        reminderDate: addDays(4),
      },
    }),
  ]);

  const [bmwMaintenanceRecord, bmwArchivedMaintenanceRecord, teslaMaintenanceRecord, audiMaintenanceRecord] = seededMaintenance;

  const bmwCreateSnapshot = {
    ...buildVehicleRecord({
      companyId: adminCompany.id,
      model: "BMW i4 eDrive40",
      vin: "SCDEMO00000000001",
      plate: "B-SC-1001",
      driver: "Alice Becker",
      status: "IN_LEASING",
      mileage: 14210,
      yearlyMileage: 22000,
      price: 58990,
      contractValue: 52900,
      interest: 3.1,
      leasingRate: 699,
      insuranceCost: 1290,
      taxPerYear: 0,
      firstRegistrationOffset: -400,
      tuvOffset: 14,
      contractStartOffset: -390,
      contractEndOffset: 160,
      billingFromOffset: -390,
      billedToOffset: 160,
      insuranceStartOffset: -380,
      insuranceEndOffset: 45,
      paymentDateOffset: 14,
      lastUpdateOffset: -21,
      customerNumber: "HQ-1001",
      inventoryNumber: "HQ-EV-1001",
    }),
  };

  const eqeCreateSnapshot = {
    ...eqeCurrent,
    createdAt: undefined,
    updatedAt: undefined,
  };

  const id4CreateSnapshot = {
    ...id4Current,
    createdAt: undefined,
    updatedAt: undefined,
    status: "ACTIVE" as const,
    driver: "Sven Keller",
    mileage: 58770,
  };

  const audiCreateSnapshot = {
    ...buildVehicleRecord({
      companyId: adminCompany.id,
      model: "Audi Q4 e-tron",
      vin: "SCDEMO00000000004",
      plate: "HH-SC-4401",
      driver: "Julia Meyer",
      status: "ACTIVE",
      mileage: 24120,
      yearlyMileage: 24000,
      price: 56600,
      contractValue: 51250,
      interest: 3.2,
      leasingRate: 649,
      insuranceCost: 1180,
      taxPerYear: 0,
      firstRegistrationOffset: -460,
      tuvOffset: 18,
      contractStartOffset: -450,
      contractEndOffset: 110,
      billingFromOffset: -450,
      billedToOffset: 110,
      insuranceStartOffset: -365,
      insuranceEndOffset: 21,
      paymentDateOffset: 6,
      lastUpdateOffset: -35,
      customerNumber: "HQ-4401",
      inventoryNumber: "HQ-EV-4401",
    }),
  };

  const teslaCreateSnapshot = {
    ...teslaCurrent,
    createdAt: undefined,
    updatedAt: undefined,
  };

  const individualCreateSnapshot = {
    ...individualCurrent,
    createdAt: undefined,
    updatedAt: undefined,
  };

  const historyEntries = [
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.CREATE,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: bmwCreateSnapshot,
      timestamp: addDays(-60),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.UPDATE,
      changedById: adminUser.id,
      oldData: {
        mileage: 14210,
        yearlyMileage: 22000,
        driver: "Alice Becker",
      },
      newData: {
        mileage: 19350,
        yearlyMileage: 25000,
        driver: "Alice Becker",
      },
      timestamp: addDays(-18),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.STATUS,
      changedById: adminUser.id,
      oldData: { status: "IN_LEASING" },
      newData: { status: "ACTIVE" },
      timestamp: addDays(-5),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.INCIDENT,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        incidentId: bmwIncident.id,
        title: bmwIncident.title,
        status: bmwIncident.status,
        occurredAt: bmwIncident.occurredAt,
        repairedAt: bmwIncident.repairedAt,
      },
      timestamp: addDays(-59),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.DOCUMENT,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        document: {
          id: bmwRegistrationDocument.id,
          title: bmwRegistrationDocument.title,
          documentType: bmwRegistrationDocument.documentType,
          originalName: bmwRegistrationDocument.originalName,
          sizeBytes: bmwRegistrationDocument.sizeBytes,
        },
      },
      timestamp: addDays(-58),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.DOCUMENT,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        document: {
          id: bmwInsuranceDocument.id,
          title: bmwInsuranceDocument.title,
          documentType: bmwInsuranceDocument.documentType,
          originalName: bmwInsuranceDocument.originalName,
          sizeBytes: bmwInsuranceDocument.sizeBytes,
          expiryDate: bmwInsuranceDocument.expiryDate,
        },
      },
      timestamp: addDays(-57),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.DOCUMENT,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        document: {
          id: bmwContractDocument.id,
          title: bmwContractDocument.title,
          documentType: bmwContractDocument.documentType,
          originalName: bmwContractDocument.originalName,
          sizeBytes: bmwContractDocument.sizeBytes,
          expiryDate: bmwContractDocument.expiryDate,
        },
      },
      timestamp: addDays(-56),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.MAINTENANCE,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        maintenance: {
          id: bmwMaintenanceRecord.id,
          title: bmwMaintenanceRecord.title,
          status: bmwMaintenanceRecord.status,
          completedAt: bmwMaintenanceRecord.completedAt,
          vendor: bmwMaintenanceRecord.vendor,
          cost: bmwMaintenanceRecord.cost,
        },
      },
      timestamp: addDays(-31),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.DOCUMENT,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        document: {
          id: bmwArchivedRiderDocument.id,
          title: bmwArchivedRiderDocument.title,
          documentType: bmwArchivedRiderDocument.documentType,
          originalName: bmwArchivedRiderDocument.originalName,
          sizeBytes: bmwArchivedRiderDocument.sizeBytes,
          expiryDate: bmwArchivedRiderDocument.expiryDate,
        },
      },
      timestamp: addDays(-28),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.ARCHIVE,
      changedById: adminUser.id,
      oldData: {
        document: {
          id: bmwArchivedRiderDocument.id,
          title: bmwArchivedRiderDocument.title,
          archivedAt: null,
          archiveReason: null,
        },
      },
      newData: {
        document: {
          id: bmwArchivedRiderDocument.id,
          title: bmwArchivedRiderDocument.title,
          archivedAt: bmwArchivedRiderDocument.archivedAt,
          archiveReason: bmwArchivedRiderDocument.archiveReason,
        },
      },
      timestamp: addDays(-14),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.ARCHIVE,
      changedById: adminUser.id,
      oldData: {
        maintenance: {
          id: bmwArchivedMaintenanceRecord.id,
          title: bmwArchivedMaintenanceRecord.title,
          archivedAt: null,
          archiveReason: null,
          status: bmwArchivedMaintenanceRecord.status,
        },
      },
      newData: {
        maintenance: {
          id: bmwArchivedMaintenanceRecord.id,
          title: bmwArchivedMaintenanceRecord.title,
          archivedAt: bmwArchivedMaintenanceRecord.archivedAt,
          archiveReason: bmwArchivedMaintenanceRecord.archiveReason,
          status: bmwArchivedMaintenanceRecord.status,
        },
      },
      timestamp: addDays(-180),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.ARCHIVE,
      changedById: adminUser.id,
      oldData: {
        document: {
          id: bmwContractDocument.id,
          title: bmwContractDocument.title,
          archivedAt: null,
          archiveReason: null,
        },
      },
      newData: {
        document: {
          id: bmwContractDocument.id,
          title: bmwContractDocument.title,
          archivedAt: addDays(-22),
          archiveReason: "Temporarily archived during contract refresh review.",
        },
      },
      timestamp: addDays(-22),
    },
    {
      vehicleId: bmwCurrent.id,
      actionType: ActionType.RESTORE,
      changedById: adminUser.id,
      oldData: {
        document: {
          id: bmwContractDocument.id,
          title: bmwContractDocument.title,
          archivedAt: addDays(-22),
          archiveReason: "Temporarily archived during contract refresh review.",
        },
      },
      newData: {
        document: {
          id: bmwContractDocument.id,
          title: bmwContractDocument.title,
          archivedAt: null,
          archiveReason: null,
        },
      },
      timestamp: addDays(-20),
    },
    {
      vehicleId: eqeCurrent.id,
      actionType: ActionType.CREATE,
      changedById: managerUser.id,
      oldData: Prisma.JsonNull,
      newData: eqeCreateSnapshot,
      timestamp: addDays(-55),
    },
    {
      vehicleId: id4Current.id,
      actionType: ActionType.CREATE,
      changedById: managerUser.id,
      oldData: Prisma.JsonNull,
      newData: id4CreateSnapshot,
      timestamp: addDays(-95),
    },
    {
      vehicleId: id4Current.id,
      actionType: ActionType.STATUS,
      changedById: managerUser.id,
      oldData: { status: "ACTIVE" },
      newData: { status: "SOLD" },
      timestamp: addDays(-18),
    },
    {
      vehicleId: id4Current.id,
      actionType: ActionType.ARCHIVE,
      changedById: companyAdminUser.id,
      oldData: {
        status: "SOLD",
        archivedAt: null,
        archiveReason: null,
      },
      newData: {
        status: "SOLD",
        archivedAt: id4Current.archivedAt,
        archiveReason: id4Current.archiveReason,
      },
      timestamp: addDays(-12),
    },
    {
      vehicleId: audiCurrent.id,
      actionType: ActionType.CREATE,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: audiCreateSnapshot,
      timestamp: addDays(-80),
    },
    {
      vehicleId: audiCurrent.id,
      actionType: ActionType.UPDATE,
      changedById: adminUser.id,
      oldData: {
        mileage: 24120,
        companyId: adminCompany.id,
      },
      newData: {
        mileage: 28110,
        companyId: adminCompany.id,
      },
      timestamp: addDays(-25),
    },
    {
      vehicleId: audiCurrent.id,
      actionType: ActionType.TRANSFER,
      changedById: adminUser.id,
      oldData: {
        companyId: adminCompany.id,
        companyName: adminCompany.name,
        status: "ACTIVE",
      },
      newData: {
        companyId: userCompany.id,
        companyName: userCompany.name,
        status: "TRANSFERRED",
      },
      timestamp: addDays(-6),
    },
    {
      vehicleId: audiCurrent.id,
      actionType: ActionType.INCIDENT,
      changedById: companyAdminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        incidentId: audiIncident.id,
        title: audiIncident.title,
        status: audiIncident.status,
        occurredAt: audiIncident.occurredAt,
      },
      timestamp: addDays(-5),
    },
    {
      vehicleId: audiCurrent.id,
      actionType: ActionType.DOCUMENT,
      changedById: companyAdminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        document: {
          id: audiIncidentAttachment.id,
          title: audiIncidentAttachment.title,
          documentType: audiIncidentAttachment.documentType,
          originalName: audiIncidentAttachment.originalName,
          incidentId: audiIncidentAttachment.incidentId,
          sizeBytes: audiIncidentAttachment.sizeBytes,
        },
      },
      timestamp: addDays(-4),
    },
    {
      vehicleId: audiCurrent.id,
      actionType: ActionType.MAINTENANCE,
      changedById: companyAdminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        maintenance: {
          id: audiMaintenanceRecord.id,
          title: audiMaintenanceRecord.title,
          status: audiMaintenanceRecord.status,
          reminderDate: audiMaintenanceRecord.reminderDate,
          vendor: audiMaintenanceRecord.vendor,
          cost: audiMaintenanceRecord.cost,
        },
      },
      timestamp: addDays(-3),
    },
    {
      vehicleId: teslaCurrent.id,
      actionType: ActionType.CREATE,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: teslaCreateSnapshot,
      timestamp: addDays(-42),
    },
    {
      vehicleId: teslaCurrent.id,
      actionType: ActionType.STATUS,
      changedById: adminUser.id,
      oldData: { status: "MAINTENANCE" },
      newData: { status: "UNDER_REPAIR" },
      timestamp: addDays(-4),
    },
    {
      vehicleId: teslaCurrent.id,
      actionType: ActionType.INCIDENT,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        incidentId: teslaIncident.id,
        title: teslaIncident.title,
        status: teslaIncident.status,
        occurredAt: teslaIncident.occurredAt,
      },
      timestamp: addDays(-7),
    },
    {
      vehicleId: teslaCurrent.id,
      actionType: ActionType.DOCUMENT,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        document: {
          id: teslaServiceDocument.id,
          title: teslaServiceDocument.title,
          documentType: teslaServiceDocument.documentType,
          originalName: teslaServiceDocument.originalName,
          sizeBytes: teslaServiceDocument.sizeBytes,
          expiryDate: teslaServiceDocument.expiryDate,
        },
      },
      timestamp: addDays(-8),
    },
    {
      vehicleId: teslaCurrent.id,
      actionType: ActionType.DOCUMENT,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        document: {
          id: teslaIncidentAttachment.id,
          title: teslaIncidentAttachment.title,
          documentType: teslaIncidentAttachment.documentType,
          originalName: teslaIncidentAttachment.originalName,
          incidentId: teslaIncidentAttachment.incidentId,
          sizeBytes: teslaIncidentAttachment.sizeBytes,
        },
      },
      timestamp: addDays(-6),
    },
    {
      vehicleId: teslaCurrent.id,
      actionType: ActionType.MAINTENANCE,
      changedById: adminUser.id,
      oldData: Prisma.JsonNull,
      newData: {
        maintenance: {
          id: teslaMaintenanceRecord.id,
          title: teslaMaintenanceRecord.title,
          status: teslaMaintenanceRecord.status,
          reminderDate: teslaMaintenanceRecord.reminderDate,
          vendor: teslaMaintenanceRecord.vendor,
          cost: teslaMaintenanceRecord.cost,
        },
      },
      timestamp: addDays(-5),
    },
    {
      vehicleId: individualCurrent.id,
      actionType: ActionType.CREATE,
      changedById: individualUser.id,
      oldData: Prisma.JsonNull,
      newData: individualCreateSnapshot,
      timestamp: addDays(-24),
    },
    {
      vehicleId: individualCurrent.id,
      actionType: ActionType.STATUS,
      changedById: individualUser.id,
      oldData: { status: "ACTIVE" },
      newData: { status: "IN_SERVICE" },
      timestamp: addDays(-9),
    },
  ];

  await prisma.$transaction(
    historyEntries.map((entry) =>
      prisma.vehicleHistory.create({
        data: {
          ...entry,
          oldData: entry.oldData === Prisma.JsonNull ? Prisma.JsonNull : toHistoryJson(entry.oldData),
          newData: entry.newData === Prisma.JsonNull ? Prisma.JsonNull : toHistoryJson(entry.newData),
        },
      }),
    ),
  );

  await prisma.supportTicket.deleteMany({
    where: {
      companyId: {
        in: [adminCompany.id, userCompany.id, individualCompany.id],
      },
    },
  });

  const technicalTicket = await prisma.supportTicket.create({
    data: {
      userId: managerUser.id,
      companyId: userCompany.id,
      vehicleId: audiCurrent.id,
      vehicleIncidentId: audiIncident.id,
      category: TicketCategory.TECHNICAL,
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.HIGH,
    },
  });

  await prisma.ticketMessage.createMany({
    data: [
      {
        ticketId: technicalTicket.id,
        senderId: managerUser.id,
        message: "The transferred Audi still shows the unresolved front-left incident. Please confirm that the audit timeline and transfer record stay linked to the damage case.",
        timestamp: addDays(-3),
      },
      {
        ticketId: technicalTicket.id,
        senderId: adminUser.id,
        message: "Confirmed. The transfer entry remains in history and the incident stays attached to the same vehicle record, including PDF export.",
        timestamp: addDays(-2),
      },
    ],
  });

  const billingTicket = await prisma.supportTicket.create({
    data: {
      userId: viewerUser.id,
      companyId: userCompany.id,
      vehicleId: id4Current.id,
      category: TicketCategory.BILLING,
      status: TicketStatus.CLOSED,
      priority: TicketPriority.MEDIUM,
    },
  });

  await prisma.ticketMessage.createMany({
    data: [
      {
        ticketId: billingTicket.id,
        senderId: viewerUser.id,
        message: "Please confirm whether archived sold vehicles remain part of our active billing scope.",
        timestamp: addDays(-8),
      },
      {
        ticketId: billingTicket.id,
        senderId: adminUser.id,
        message: "Sold vehicles remain visible for reporting but are excluded from active fleet billing calculations. The ticket can be closed.",
        timestamp: addDays(-7),
      },
    ],
  });

  const incidentTicket = await prisma.supportTicket.create({
    data: {
      userId: individualUser.id,
      companyId: individualCompany.id,
      vehicleId: individualCurrent.id,
      category: TicketCategory.OTHER,
      status: TicketStatus.OPEN,
      priority: TicketPriority.LOW,
    },
  });

  await prisma.ticketMessage.createMany({
    data: [
      {
        ticketId: incidentTicket.id,
        senderId: individualUser.id,
        message: "Personal workspace is working well. Please keep this ticket as a demo example for individual-user onboarding.",
        timestamp: addDays(-2),
      },
    ],
  });

  const demoUserIds = [
    adminUser.id,
    ownerAdminUser.id,
    companyAdminUser.id,
    managerUser.id,
    viewerUser.id,
    individualUser.id,
  ];

  await prisma.approvalRequest.deleteMany({
    where: {
      OR: [
        { companyId: { in: [adminCompany.id, userCompany.id, individualCompany.id] } },
        { requestedById: { in: demoUserIds } },
        { reviewedById: { in: demoUserIds } },
      ],
    },
  });

  const pendingTransferApproval = await prisma.approvalRequest.create({
    data: {
      companyId: userCompany.id,
      requestedById: companyAdminUser.id,
      action: ApprovalAction.ADMIN_VEHICLE_TRANSFER,
      status: ApprovalStatus.PENDING,
      entityType: SystemEntityType.VEHICLE,
      entityId: eqeCurrent.id,
      payload: toHistoryJson({
        vehicleId: eqeCurrent.id,
        model: eqeCurrent.model,
        vin: eqeCurrent.vin,
        targetCompanyId: adminCompany.id,
        targetCompanyName: adminCompany.name,
        requestedReason: "Premium fleet rebalancing after quarterly allocation review.",
      }),
      reason: "Awaiting platform admin review before premium fleet rebalancing.",
      createdAt: addDays(-1),
      updatedAt: addDays(-1),
    },
  });

  const approvedArchiveApproval = await prisma.approvalRequest.create({
    data: {
      companyId: userCompany.id,
      requestedById: companyAdminUser.id,
      reviewedById: adminUser.id,
      action: ApprovalAction.ADMIN_VEHICLE_DELETE,
      status: ApprovalStatus.APPROVED,
      entityType: SystemEntityType.VEHICLE,
      entityId: id4Current.id,
      payload: toHistoryJson({
        vehicleId: id4Current.id,
        model: id4Current.model,
        vin: id4Current.vin,
        archiveReason: id4Current.archiveReason,
      }),
      reason: "Archive disposed vehicle instead of removing historical records.",
      reviewComment: "Approved as archive-only operation to preserve reporting history.",
      reviewedAt: addDays(-12),
      createdAt: addDays(-13),
      updatedAt: addDays(-12),
    },
  });

  await prisma.appNotification.deleteMany({
    where: {
      userId: {
        in: demoUserIds,
      },
    },
  });

  await prisma.vehiclePublicShareLink.deleteMany({
    where: {
      vehicleId: {
        in: [bmwCurrent.id, audiCurrent.id, eqeCurrent.id, id4Current.id, teslaCurrent.id, individualCurrent.id],
      },
    },
  });

  const seededPublicVehicleLink = await prisma.vehiclePublicShareLink.create({
    data: {
      vehicleId: bmwCurrent.id,
      createdById: adminUser.id,
      tokenHash: hashPublicShareToken("seed-public-bmw"),
      label: "Broker read-only snapshot",
      expiresAt: addDays(14),
      lastAccessedAt: addDays(-1),
      accessCount: 3,
      createdAt: addDays(-2),
      updatedAt: addDays(-1),
    },
  });

  await prisma.$transaction([
    prisma.appNotification.create({
      data: {
        userId: adminUser.id,
        companyId: adminCompany.id,
        type: NotificationType.APPROVAL,
        title: "Pending fleet approval",
        message: `Transfer approval for ${eqeCurrent.model} is waiting in the admin queue.`,
        status: NotificationStatus.UNREAD,
        priority: NotificationPriority.HIGH,
        entityType: SystemEntityType.APPROVAL,
        entityId: pendingTransferApproval.id,
        link: "/admin/approvals",
        sourceKey: "seed:notification:approval-pending-admin",
        metadata: toHistoryJson({
          state: "pending",
          companyId: userCompany.id,
          vehicleId: eqeCurrent.id,
          vehicleModel: eqeCurrent.model,
        }),
        createdAt: addDays(-1),
      },
    }),
    prisma.appNotification.create({
      data: {
        userId: companyAdminUser.id,
        companyId: userCompany.id,
        type: NotificationType.VEHICLE,
        title: "Vehicle archive approved",
        message: `${id4Current.model} was archived with full history preserved for Fleet Partners.`,
        status: NotificationStatus.READ,
        priority: NotificationPriority.MEDIUM,
        entityType: SystemEntityType.VEHICLE,
        entityId: id4Current.id,
        link: `/vehicles/${id4Current.id}`,
        sourceKey: "seed:notification:vehicle-archive-company-admin",
        metadata: toHistoryJson({
          state: "approved",
          companyId: userCompany.id,
          approvalId: approvedArchiveApproval.id,
          vehicleId: id4Current.id,
        }),
        readAt: addDays(-11),
        createdAt: addDays(-12),
      },
    }),
    prisma.appNotification.create({
      data: {
        userId: managerUser.id,
        companyId: userCompany.id,
        type: NotificationType.SUPPORT,
        title: "Support replied to your incident ticket",
        message: "The Audi transfer case now confirms that incident and transfer history stay linked in export and audit views.",
        status: NotificationStatus.UNREAD,
        priority: NotificationPriority.HIGH,
        entityType: SystemEntityType.TICKET,
        entityId: technicalTicket.id,
        link: "/support",
        sourceKey: "seed:notification:support-reply-manager",
        metadata: toHistoryJson({
          state: "open",
          companyId: userCompany.id,
          vehicleId: audiCurrent.id,
          ticketId: technicalTicket.id,
          incidentId: audiIncident.id,
        }),
        createdAt: addDays(-2),
      },
    }),
    prisma.appNotification.create({
      data: {
        userId: managerUser.id,
        companyId: userCompany.id,
        type: NotificationType.REMINDER,
        title: "Archive review reminder",
        message: `${id4Current.model} remains searchable in archive view and excluded from active fleet operations.`,
        status: NotificationStatus.READ,
        priority: NotificationPriority.LOW,
        entityType: SystemEntityType.VEHICLE,
        entityId: id4Current.id,
        link: `/vehicles/${id4Current.id}`,
        sourceKey: "seed:notification:archive-reminder-manager",
        metadata: toHistoryJson({
          state: "read",
          companyId: userCompany.id,
          vehicleId: id4Current.id,
        }),
        readAt: addDays(-10),
        createdAt: addDays(-10),
      },
    }),
    prisma.appNotification.create({
      data: {
        userId: viewerUser.id,
        companyId: userCompany.id,
        type: NotificationType.SYSTEM,
        title: "Reference notification archived",
        message: "This archived notification demonstrates the archived filter in the notification center.",
        status: NotificationStatus.ARCHIVED,
        priority: NotificationPriority.LOW,
        entityType: SystemEntityType.COMPANY,
        entityId: userCompany.id,
        link: "/notifications",
        sourceKey: "seed:notification:archived-viewer",
        metadata: toHistoryJson({
          state: "archived",
          companyId: userCompany.id,
        }),
        readAt: addDays(-8),
        archivedAt: addDays(-7),
        createdAt: addDays(-9),
      },
    }),
    prisma.appNotification.create({
      data: {
        userId: individualUser.id,
        companyId: individualCompany.id,
        type: NotificationType.MAINTENANCE,
        title: "Service status updated",
        message: `${individualCurrent.model} is marked as in service and ready for individual-workspace demos.`,
        status: NotificationStatus.READ,
        priority: NotificationPriority.MEDIUM,
        entityType: SystemEntityType.VEHICLE,
        entityId: individualCurrent.id,
        link: `/vehicles/${individualCurrent.id}`,
        sourceKey: "seed:notification:individual-service-ready",
        metadata: toHistoryJson({
          state: "in_service",
          companyId: individualCompany.id,
          vehicleId: individualCurrent.id,
        }),
        readAt: addDays(-8),
        createdAt: addDays(-9),
      },
    }),
  ]);

  await prisma.systemLog.deleteMany({
    where: {
      OR: [
        { userId: { in: demoUserIds } },
        { companyId: { in: [adminCompany.id, userCompany.id, individualCompany.id] } },
      ],
    },
  });

  const logs = [
      {
        userId: adminUser.id,
        action: "LOGIN_SUCCESS",
        entityType: SystemEntityType.USER,
        entityId: adminUser.id,
        metadata: {
          email: adminUser.email,
          companyId: adminCompany.id,
          role: "ADMIN",
          source: "seed",
        },
        timestamp: addDays(-4),
      },
      {
        userId: null,
        action: "LOGIN_FAILED",
        entityType: SystemEntityType.USER,
        entityId: null,
        metadata: {
          email: "unknown@solicar.com",
          reason: "USER_NOT_FOUND",
          source: "seed",
        },
        timestamp: addDays(-4),
      },
      {
        userId: adminUser.id,
        action: "VEHICLE_TRANSFER",
        entityType: SystemEntityType.VEHICLE,
        entityId: audiCurrent.id,
        metadata: {
          model: audiCurrent.model,
          vin: audiCurrent.vin,
          fromCompanyId: adminCompany.id,
          toCompanyId: userCompany.id,
          source: "seed",
        },
        timestamp: addDays(-6),
      },
      {
        userId: companyAdminUser.id,
        companyId: userCompany.id,
        action: "VEHICLE_ARCHIVE",
        entityType: SystemEntityType.VEHICLE,
        entityId: id4Current.id,
        metadata: {
          companyId: userCompany.id,
          model: id4Current.model,
          vin: id4Current.vin,
          archiveReason: id4Current.archiveReason,
          source: "seed",
        },
        timestamp: addDays(-12),
      },
      {
        userId: adminUser.id,
        companyId: adminCompany.id,
        action: "VEHICLE_STATUS_UPDATE",
        entityType: SystemEntityType.VEHICLE,
        entityId: teslaCurrent.id,
        metadata: {
          companyId: adminCompany.id,
          model: teslaCurrent.model,
          vin: teslaCurrent.vin,
          previousStatus: "MAINTENANCE",
          nextStatus: teslaCurrent.status,
          source: "seed",
        },
        timestamp: addDays(-4),
      },
      {
        userId: individualUser.id,
        companyId: individualCompany.id,
        action: "VEHICLE_STATUS_UPDATE",
        entityType: SystemEntityType.VEHICLE,
        entityId: individualCurrent.id,
        metadata: {
          companyId: individualCompany.id,
          model: individualCurrent.model,
          vin: individualCurrent.vin,
          previousStatus: "ACTIVE",
          nextStatus: individualCurrent.status,
          source: "seed",
        },
        timestamp: addDays(-9),
      },
      {
        userId: adminUser.id,
        action: "USER_ROLE_CHANGE",
        entityType: SystemEntityType.USER,
        entityId: viewerUser.id,
        metadata: {
          previousRole: "VIEWER",
          nextRole: "VIEWER",
          note: "Demo baseline",
          source: "seed",
        },
        timestamp: addDays(-3),
      },
      {
        userId: adminUser.id,
        action: "BILLING_PLAN_CHANGED",
        entityType: SystemEntityType.COMPANY,
        entityId: adminCompany.id,
        metadata: {
          companyId: adminCompany.id,
          plan: "PRO",
          status: "ACTIVE",
          source: "seed",
        },
        timestamp: addDays(-2),
      },
      {
        userId: companyAdminUser.id,
        action: "INVITATION_CREATE",
        entityType: SystemEntityType.INVITATION,
        entityId: pendingFleetInvitation.id,
        metadata: {
          companyId: userCompany.id,
          companyName: userCompany.name,
          email: pendingFleetInvitation.email,
          role: pendingFleetInvitation.role,
          expiresAt: pendingFleetInvitation.expiresAt,
          source: "seed",
        },
        timestamp: addDays(-1),
      },
      {
        userId: adminUser.id,
        action: "INVITATION_REVOKE",
        entityType: SystemEntityType.INVITATION,
        entityId: revokedAuditInvitation.id,
        metadata: {
          companyId: adminCompany.id,
          companyName: adminCompany.name,
          email: revokedAuditInvitation.email,
          role: revokedAuditInvitation.role,
          source: "seed",
        },
        timestamp: addDays(-1),
      },
      {
        userId: adminUser.id,
        companyId: adminCompany.id,
        action: "EMAIL_VERIFIED",
        entityType: SystemEntityType.USER,
        entityId: adminUser.id,
        metadata: {
          email: adminUser.email,
          companyId: adminCompany.id,
          source: "seed",
        },
        timestamp: addDays(-60),
      },
      {
        userId: companyAdminUser.id,
        companyId: userCompany.id,
        action: "EMAIL_VERIFICATION_RESENT",
        entityType: SystemEntityType.USER,
        entityId: companyAdminUser.id,
        metadata: {
          email: companyAdminUser.email,
          companyId: userCompany.id,
          deliveryMode: "log",
          source: "seed",
        },
        timestamp: addDays(-43),
      },
      {
        userId: managerUser.id,
        companyId: userCompany.id,
        action: "ONBOARDING_COMPLETED",
        entityType: SystemEntityType.USER,
        entityId: managerUser.id,
        metadata: {
          email: managerUser.email,
          preferredLanguage: "de",
          preferredTheme: "dark",
          preferredVehicleView: "cards",
          source: "seed",
        },
        timestamp: addDays(-34),
      },
      {
        userId: adminUser.id,
        companyId: adminCompany.id,
        action: "SESSION_REVOKED",
        entityType: SystemEntityType.USER,
        entityId: adminUser.id,
        metadata: {
          sessionId: "seed-revoked-session",
          reason: "security_review",
          source: "seed",
        },
        timestamp: addDays(-5),
      },
      {
        userId: adminUser.id,
        companyId: adminCompany.id,
        action: "PUBLIC_LINK_CREATED",
        entityType: SystemEntityType.VEHICLE,
        entityId: bmwCurrent.id,
        metadata: {
          shareLinkId: seededPublicVehicleLink.id,
          vehicleId: bmwCurrent.id,
          companyId: adminCompany.id,
          label: seededPublicVehicleLink.label,
          source: "seed",
        },
        timestamp: addDays(-2),
      },
      {
        userId: null,
        companyId: adminCompany.id,
        action: "PUBLIC_LINK_ACCESSED",
        entityType: SystemEntityType.VEHICLE,
        entityId: bmwCurrent.id,
        metadata: {
          shareLinkId: seededPublicVehicleLink.id,
          vehicleId: bmwCurrent.id,
          source: "seed",
        },
        timestamp: addDays(-1),
      },
      {
        userId: adminUser.id,
        action: "VEHICLE_DOCUMENT_UPLOAD",
        entityType: SystemEntityType.DOCUMENT,
        entityId: bmwInsuranceDocument.id,
        metadata: {
          vehicleId: bmwCurrent.id,
          companyId: adminCompany.id,
          title: bmwInsuranceDocument.title,
          documentType: bmwInsuranceDocument.documentType,
          source: "seed",
        },
        timestamp: addDays(-57),
      },
      {
        userId: companyAdminUser.id,
        action: "INCIDENT_ATTACHMENT_UPLOAD",
        entityType: SystemEntityType.DOCUMENT,
        entityId: audiIncidentAttachment.id,
        metadata: {
          vehicleId: audiCurrent.id,
          companyId: userCompany.id,
          incidentId: audiIncident.id,
          title: audiIncidentAttachment.title,
          source: "seed",
        },
        timestamp: addDays(-4),
      },
      {
        userId: adminUser.id,
        companyId: adminCompany.id,
        action: "VEHICLE_DOCUMENT_ARCHIVE",
        entityType: SystemEntityType.DOCUMENT,
        entityId: bmwArchivedRiderDocument.id,
        metadata: {
          vehicleId: bmwCurrent.id,
          companyId: adminCompany.id,
          title: bmwArchivedRiderDocument.title,
          archiveReason: bmwArchivedRiderDocument.archiveReason,
          source: "seed",
        },
        timestamp: addDays(-14),
      },
      {
        userId: adminUser.id,
        companyId: adminCompany.id,
        action: "VEHICLE_DOCUMENT_RESTORE",
        entityType: SystemEntityType.DOCUMENT,
        entityId: bmwContractDocument.id,
        metadata: {
          vehicleId: bmwCurrent.id,
          companyId: adminCompany.id,
          title: bmwContractDocument.title,
          source: "seed",
        },
        timestamp: addDays(-20),
      },
      {
        userId: adminUser.id,
        action: "VEHICLE_MAINTENANCE_CREATE",
        entityType: SystemEntityType.MAINTENANCE,
        entityId: teslaMaintenanceRecord.id,
        metadata: {
          vehicleId: teslaCurrent.id,
          companyId: adminCompany.id,
          title: teslaMaintenanceRecord.title,
          status: teslaMaintenanceRecord.status,
          source: "seed",
        },
        timestamp: addDays(-5),
      },
      {
        userId: adminUser.id,
        companyId: adminCompany.id,
        action: "VEHICLE_MAINTENANCE_ARCHIVE",
        entityType: SystemEntityType.MAINTENANCE,
        entityId: bmwArchivedMaintenanceRecord.id,
        metadata: {
          vehicleId: bmwCurrent.id,
          companyId: adminCompany.id,
          title: bmwArchivedMaintenanceRecord.title,
          archiveReason: bmwArchivedMaintenanceRecord.archiveReason,
          source: "seed",
        },
        timestamp: addDays(-180),
      },
      {
        userId: companyAdminUser.id,
        companyId: userCompany.id,
        action: "APPROVAL_REQUEST_CREATE",
        entityType: SystemEntityType.APPROVAL,
        entityId: pendingTransferApproval.id,
        metadata: {
          companyId: userCompany.id,
          vehicleId: eqeCurrent.id,
          model: eqeCurrent.model,
          action: pendingTransferApproval.action,
          source: "seed",
        },
        timestamp: addDays(-1),
      },
      {
        userId: adminUser.id,
        companyId: userCompany.id,
        action: "APPROVAL_REQUEST_APPROVE",
        entityType: SystemEntityType.APPROVAL,
        entityId: approvedArchiveApproval.id,
        metadata: {
          companyId: userCompany.id,
          vehicleId: id4Current.id,
          model: id4Current.model,
          action: approvedArchiveApproval.action,
          source: "seed",
        },
        timestamp: addDays(-12),
      },
      {
        userId: adminUser.id,
        action: "TICKET_CREATE",
        entityType: SystemEntityType.TICKET,
        entityId: null,
        metadata: {
          companyId: userCompany.id,
          note: "Seeded support backlog",
          source: "seed",
        },
        timestamp: addDays(-3),
      },
  ];

  await prisma.$transaction(
    logs.map((entry) =>
      prisma.systemLog.create({
        data: {
          ...entry,
          metadata: toHistoryJson(entry.metadata),
        },
      }),
    ),
  );

  console.log("Seed complete with demo companies, users, vehicles, transfer data, history, tickets, and logs.");
  console.log(`PLATFORM ADMIN -> ${demoCredentials.admin.email} / ${demoCredentials.admin.password}`);
  console.log(`PLATFORM ADMIN -> ${demoCredentials.ownerAdmin.email} / ${demoCredentials.ownerAdmin.password}`);
  console.log(`COMPANY ADMIN  -> ${demoCredentials.companyAdmin.email} / ${demoCredentials.companyAdmin.password}`);
  console.log(`MANAGER -> ${demoCredentials.manager.email} / ${demoCredentials.manager.password}`);
  console.log(`VIEWER -> ${demoCredentials.viewer.email} / ${demoCredentials.viewer.password}`);
  console.log(`INDIVIDUAL USER -> ${demoCredentials.individual.email} / ${demoCredentials.individual.password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
