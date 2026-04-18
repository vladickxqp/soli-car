import { Prisma, PrismaClient, VehicleStatus } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface ReminderScope {
  companyId: string;
  role: "ADMIN" | "MANAGER" | "VIEWER";
  isPlatformAdmin?: boolean;
}

export type ReminderType = "TUV" | "INSURANCE" | "CONTRACT" | "MAINTENANCE" | "DOCUMENT";
export type ReminderState = "UPCOMING" | "DUE" | "OVERDUE";

const ACTIVE_STATUSES: VehicleStatus[] = ["ACTIVE", "IN_LEASING", "MAINTENANCE"];

const getScopedVehicleWhere = (
  user: ReminderScope,
  selectedCompanyId?: string,
): Prisma.VehicleWhereInput => ({
  deletedAt: null,
  ...(user.isPlatformAdmin
    ? selectedCompanyId
      ? { companyId: selectedCompanyId }
      : {}
    : { companyId: user.companyId }),
});

const getReminderState = (daysRemaining: number): ReminderState => {
  if (daysRemaining < 0) {
    return "OVERDUE";
  }

  if (daysRemaining <= 3) {
    return "DUE";
  }

  return "UPCOMING";
};

const toDaysRemaining = (date: Date, now: Date) =>
  Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

export const getDueReminders = async (
  db: DbClient,
  user: ReminderScope,
  options?: {
    companyId?: string;
    type?: ReminderType;
    state?: ReminderState;
  },
) => {
  const where = getScopedVehicleWhere(user, options?.companyId);
  const activeWhere: Prisma.VehicleWhereInput = {
    ...where,
    status: {
      in: ACTIVE_STATUSES,
    },
  };
  const now = new Date();
  const threshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [vehicles, maintenanceRecords, documents] = await Promise.all([
    db.vehicle.findMany({
      where: {
        ...activeWhere,
        OR: [
          { tuvDate: { lte: threshold } },
          { insuranceEnd: { lte: threshold } },
          { contractEnd: { lte: threshold } },
        ],
      },
      select: {
        id: true,
        model: true,
        plate: true,
        status: true,
        companyId: true,
        tuvDate: true,
        insuranceEnd: true,
        contractEnd: true,
        company: {
          select: {
            name: true,
          },
        },
      },
    }),
    db.vehicleMaintenanceRecord.findMany({
      where: {
        vehicle: where,
        reminderDate: {
          not: null,
          lte: threshold,
        },
      },
      select: {
        id: true,
        title: true,
        reminderDate: true,
        status: true,
        vehicle: {
          select: {
            id: true,
            model: true,
            plate: true,
            status: true,
            companyId: true,
            company: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    db.vehicleDocument.findMany({
      where: {
        vehicle: where,
        expiryDate: {
          not: null,
          lte: threshold,
        },
      },
      select: {
        id: true,
        title: true,
        expiryDate: true,
        documentType: true,
        vehicle: {
          select: {
            id: true,
            model: true,
            plate: true,
            status: true,
            companyId: true,
            company: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const reminders = [
    ...vehicles.flatMap((vehicle) =>
      [
        { type: "TUV" as const, date: vehicle.tuvDate, title: "TUV expires soon" },
        { type: "INSURANCE" as const, date: vehicle.insuranceEnd, title: "Insurance expires soon" },
        { type: "CONTRACT" as const, date: vehicle.contractEnd, title: "Contract ends soon" },
      ].map((item) => {
        const daysRemaining = toDaysRemaining(item.date, now);
        return {
          id: `${vehicle.id}-${item.type}`,
          type: item.type,
          title: item.title,
          dueDate: item.date.toISOString(),
          daysRemaining,
          state: getReminderState(daysRemaining),
          vehicle: {
            id: vehicle.id,
            model: vehicle.model,
            plate: vehicle.plate,
            status: vehicle.status,
            companyId: vehicle.companyId,
            companyName: vehicle.company.name,
          },
        };
      }),
    ),
    ...maintenanceRecords.map((record) => {
      const dueDate = record.reminderDate as Date;
      const daysRemaining = toDaysRemaining(dueDate, now);
      return {
        id: `${record.id}-MAINTENANCE`,
        type: "MAINTENANCE" as const,
        title: record.title,
        dueDate: dueDate.toISOString(),
        daysRemaining,
        state: getReminderState(daysRemaining),
        vehicle: {
          id: record.vehicle.id,
          model: record.vehicle.model,
          plate: record.vehicle.plate,
          status: record.vehicle.status,
          companyId: record.vehicle.companyId,
          companyName: record.vehicle.company.name,
        },
      };
    }),
    ...documents.map((document) => {
      const dueDate = document.expiryDate as Date;
      const daysRemaining = toDaysRemaining(dueDate, now);
      return {
        id: `${document.id}-DOCUMENT`,
        type: "DOCUMENT" as const,
        title: document.title,
        dueDate: dueDate.toISOString(),
        daysRemaining,
        state: getReminderState(daysRemaining),
        vehicle: {
          id: document.vehicle.id,
          model: document.vehicle.model,
          plate: document.vehicle.plate,
          status: document.vehicle.status,
          companyId: document.vehicle.companyId,
          companyName: document.vehicle.company.name,
        },
      };
    }),
  ]
    .filter((item) => item.daysRemaining <= 30)
    .filter((item) => (options?.type ? item.type === options.type : true))
    .filter((item) => (options?.state ? item.state === options.state : true))
    .sort((left, right) => left.daysRemaining - right.daysRemaining);

  return reminders;
};
