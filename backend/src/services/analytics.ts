import { Prisma, PrismaClient, VehicleStatus } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

interface AnalyticsUserScope {
  role: "ADMIN" | "MANAGER" | "VIEWER";
  companyId: string;
  isPlatformAdmin?: boolean;
}

const ALERT_STATUSES: VehicleStatus[] = ["ACTIVE", "IN_LEASING", "MAINTENANCE"];

const toMonthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const buildPastMonthRange = (count: number) => {
  const months = [];
  const now = new Date();

  for (let index = count - 1; index >= 0; index -= 1) {
    const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    months.push({
      key: toMonthKey(value),
      label: value.toLocaleString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      monthStart: value,
    });
  }

  return months;
};

const buildFutureMonthRange = (count: number) => {
  const months = [];
  const now = new Date();

  for (let index = 0; index < count; index += 1) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index, 1));
    months.push({
      key: toMonthKey(monthStart),
      label: monthStart.toLocaleString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      monthStart,
    });
  }

  return months;
};

const getScopedVehicleWhere = (
  user: AnalyticsUserScope,
  selectedCompanyId?: string,
): Prisma.VehicleWhereInput => ({
  deletedAt: null,
  ...(user.isPlatformAdmin
    ? selectedCompanyId
      ? { companyId: selectedCompanyId }
      : {}
    : { companyId: user.companyId }),
});

const getSeverity = (daysRemaining: number) =>
  daysRemaining <= 0 ? "red" : daysRemaining <= 7 ? "yellow" : "green";

const buildNotifications = (
  input: {
    vehicles: Array<{
      id: string;
      model: string;
      plate: string;
      status: VehicleStatus;
      tuvDate: Date;
      insuranceEnd: Date;
      contractEnd: Date;
      company: { name: string };
    }>;
    maintenanceRecords: Array<{
      id: string;
      title: string;
      reminderDate: Date | null;
      vehicle: {
        id: string;
        model: string;
        plate: string;
        status: VehicleStatus;
        company: { name: string };
      };
    }>;
    documents: Array<{
      id: string;
      title: string;
      expiryDate: Date | null;
      vehicle: {
        id: string;
        model: string;
        plate: string;
        status: VehicleStatus;
        company: { name: string };
      };
    }>;
  },
) => {
  const now = new Date();
  const thirtyDaysFromNow = now.getTime() + 30 * 24 * 60 * 60 * 1000;

  const vehicleAlerts = input.vehicles.flatMap((vehicle) =>
      [
        { type: "TUV", dueDate: vehicle.tuvDate, title: "TUV expires soon" },
        { type: "INSURANCE", dueDate: vehicle.insuranceEnd, title: "Insurance expires soon" },
        { type: "CONTRACT", dueDate: vehicle.contractEnd, title: "Contract ends soon" },
      ]
        .filter((item) => item.dueDate.getTime() <= thirtyDaysFromNow)
        .map((item) => {
          const daysRemaining = Math.ceil((item.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

          return {
            id: `${vehicle.id}-${item.type}`,
            type: item.type,
            severity: getSeverity(daysRemaining),
            title: item.title,
            dueDate: item.dueDate.toISOString(),
            daysRemaining,
            vehicle: {
              id: vehicle.id,
              model: vehicle.model,
              plate: vehicle.plate,
              status: vehicle.status,
              companyName: vehicle.company.name,
            },
          };
        }),
    );

  const maintenanceAlerts = input.maintenanceRecords
    .filter((record) => record.reminderDate && record.reminderDate.getTime() <= thirtyDaysFromNow)
    .map((record) => {
      const daysRemaining = Math.ceil(((record.reminderDate as Date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      return {
        id: `${record.id}-MAINTENANCE`,
        type: "MAINTENANCE",
        severity: getSeverity(daysRemaining),
        title: record.title,
        dueDate: (record.reminderDate as Date).toISOString(),
        daysRemaining,
        vehicle: {
          id: record.vehicle.id,
          model: record.vehicle.model,
          plate: record.vehicle.plate,
          status: record.vehicle.status,
          companyName: record.vehicle.company.name,
        },
      };
    });

  const documentAlerts = input.documents
    .filter((document) => document.expiryDate && document.expiryDate.getTime() <= thirtyDaysFromNow)
    .map((document) => {
      const daysRemaining = Math.ceil(((document.expiryDate as Date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      return {
        id: `${document.id}-DOCUMENT`,
        type: "DOCUMENT",
        severity: getSeverity(daysRemaining),
        title: document.title,
        dueDate: (document.expiryDate as Date).toISOString(),
        daysRemaining,
        vehicle: {
          id: document.vehicle.id,
          model: document.vehicle.model,
          plate: document.vehicle.plate,
          status: document.vehicle.status,
          companyName: document.vehicle.company.name,
        },
      };
    });

  return [...vehicleAlerts, ...maintenanceAlerts, ...documentAlerts]
    .sort((left, right) => left.daysRemaining - right.daysRemaining)
    .slice(0, 12);
};

export const getAdvancedAnalytics = async (
  db: DbClient,
  user: AnalyticsUserScope,
  selectedCompanyId?: string,
) => {
  const where = getScopedVehicleWhere(user, selectedCompanyId);
  const activeWhere: Prisma.VehicleWhereInput = {
    ...where,
    status: {
      in: ALERT_STATUSES,
    },
  };

  const [aggregate, groupedByCompany, statusBreakdown, vehiclesWithAccidents, damagedVehicles, maintenanceAggregate, maintenanceRecords, expiringDocuments, vehicles] = await Promise.all([
    db.vehicle.aggregate({
      where,
      _count: { id: true },
      _sum: {
        mileage: true,
        insuranceCost: true,
        contractValue: true,
      },
      _avg: {
        mileage: true,
      },
    }),
    db.vehicle.groupBy({
      by: ["companyId"],
      where,
      _count: { _all: true },
      _sum: {
        mileage: true,
        insuranceCost: true,
        contractValue: true,
      },
      _avg: {
        mileage: true,
      },
    }),
    db.vehicle.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    db.vehicle.count({
      where: {
        ...where,
        OR: [
          { hadPreviousAccidents: true },
          { incidents: { some: {} } },
        ],
      },
    }),
    db.vehicle.count({
      where: {
        ...where,
        damageStatus: {
          not: "NONE",
        },
      },
    }),
    db.vehicleMaintenanceRecord.aggregate({
      where: {
        vehicle: where,
      },
      _sum: {
        cost: true,
      },
    }),
    db.vehicleMaintenanceRecord.findMany({
      where: {
        vehicle: where,
      },
      select: {
        id: true,
        title: true,
        status: true,
        reminderDate: true,
        createdAt: true,
        serviceDate: true,
        completedAt: true,
        cost: true,
        vehicle: {
          select: {
            id: true,
            model: true,
            plate: true,
            status: true,
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
        },
      },
      select: {
        id: true,
        title: true,
        expiryDate: true,
        vehicle: {
          select: {
            id: true,
            model: true,
            plate: true,
            status: true,
            company: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    db.vehicle.findMany({
      where,
      select: {
        id: true,
        companyId: true,
        model: true,
        plate: true,
        status: true,
        firstRegistration: true,
        contractEnd: true,
        insuranceEnd: true,
        insuranceCost: true,
        contractValue: true,
        leasingRate: true,
        yearlyMileage: true,
        mileage: true,
        taxPerYear: true,
        tuvDate: true,
        company: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const companyIds = groupedByCompany.map((item) => item.companyId);
  const companies = companyIds.length
    ? await db.company.findMany({
        where: {
          id: {
            in: companyIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
      })
    : [];

  const companyNameById = Object.fromEntries(companies.map((company) => [company.id, company.name]));

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const activeVehicles = vehicles.filter((vehicle) => ALERT_STATUSES.includes(vehicle.status));

  const expiringTuvCount = activeVehicles.filter(
    (vehicle) => vehicle.tuvDate >= now && vehicle.tuvDate <= thirtyDaysFromNow,
  ).length;

  const expiringInsuranceCount = activeVehicles.filter(
    (vehicle) => vehicle.insuranceEnd >= now && vehicle.insuranceEnd <= thirtyDaysFromNow,
  ).length;
  const upcomingServiceReminders = maintenanceRecords.filter(
    (record) => record.reminderDate && record.reminderDate >= now && record.reminderDate <= thirtyDaysFromNow,
  ).length;

  const registrationMonths = buildPastMonthRange(12);
  const registrationsByMonth = Object.fromEntries(registrationMonths.map((month) => [month.key, 0]));

  vehicles.forEach((vehicle) => {
    const key = toMonthKey(vehicle.firstRegistration);
    if (key in registrationsByMonth) {
      registrationsByMonth[key] += 1;
    }
  });

  let cumulativeVehicles = 0;
  const vehiclesOverTime = registrationMonths.map((month) => {
    const value = registrationsByMonth[month.key] ?? 0;
    cumulativeVehicles += value;
    return {
      label: month.label,
      vehicles: value,
      cumulativeVehicles,
    };
  });

  const projectedMonths = buildFutureMonthRange(6);
  const costsOverTime = projectedMonths.map((month) => {
    let leasingCost = 0;
    let insuranceCost = 0;
    let taxCost = 0;

    activeVehicles.forEach((vehicle) => {
      if (vehicle.contractEnd >= month.monthStart) {
        leasingCost += vehicle.leasingRate;
        taxCost += vehicle.taxPerYear / 12;
      }

      if (vehicle.insuranceEnd >= month.monthStart) {
        insuranceCost += vehicle.insuranceCost / 12;
      }
    });

    return {
      label: month.label,
      leasingCost: Number(leasingCost.toFixed(2)),
      insuranceCost: Number(insuranceCost.toFixed(2)),
      taxCost: Number(taxCost.toFixed(2)),
      totalCost: Number((leasingCost + insuranceCost + taxCost).toFixed(2)),
    };
  });

  const mileageOverTime = projectedMonths.map((month) => {
    let projectedMileage = 0;
    let countedVehicles = 0;

    activeVehicles.forEach((vehicle) => {
      if (vehicle.contractEnd >= month.monthStart) {
        projectedMileage += vehicle.yearlyMileage / 12;
        countedVehicles += 1;
      }
    });

    return {
      label: month.label,
      projectedMileage: Math.round(projectedMileage),
      averageMileage:
        countedVehicles === 0
          ? 0
          : Math.round(
              activeVehicles
                .filter((vehicle) => vehicle.contractEnd >= month.monthStart)
                .reduce((sum, vehicle) => sum + vehicle.mileage, 0) / countedVehicles,
              ),
    };
  });

  const maintenanceMonths = buildPastMonthRange(6);
  const maintenanceOverTime = maintenanceMonths.map((month) => {
    const monthEnd = new Date(Date.UTC(month.monthStart.getUTCFullYear(), month.monthStart.getUTCMonth() + 1, 1));
    const matchingRecords = maintenanceRecords.filter((record) => {
      const referenceDate = record.completedAt ?? record.serviceDate ?? record.createdAt;
      return referenceDate >= month.monthStart && referenceDate < monthEnd;
    });

    return {
      label: month.label,
      events: matchingRecords.length,
      cost: Number(matchingRecords.reduce((sum, record) => sum + (record.cost ?? 0), 0).toFixed(2)),
    };
  });

  const damageBreakdown = [
    {
      key: "damaged",
      label: "Damaged",
      count: damagedVehicles,
    },
    {
      key: "clean",
      label: "Clean",
      count: Math.max(0, aggregate._count.id - damagedVehicles),
    },
  ];

  return {
    summary: {
      totalVehicles: aggregate._count.id,
      totalMileage: aggregate._sum.mileage ?? 0,
      averageMileage: Math.round(aggregate._avg.mileage ?? 0),
      totalInsuranceCost: Number((aggregate._sum.insuranceCost ?? 0).toFixed(2)),
      totalLeasingCost: Number((aggregate._sum.contractValue ?? 0).toFixed(2)),
      totalCost: Number(
        ((aggregate._sum.insuranceCost ?? 0) + (aggregate._sum.contractValue ?? 0)).toFixed(2),
      ),
      expiringTuvCount,
      expiringInsuranceCount,
      vehiclesWithAccidents,
      damagedVehicles,
      totalMaintenanceCost: Number((maintenanceAggregate._sum.cost ?? 0).toFixed(2)),
      upcomingServiceReminders,
    },
    vehiclesPerCompany: groupedByCompany
      .map((item) => ({
        companyId: item.companyId,
        companyName: companyNameById[item.companyId] ?? item.companyId,
        vehicleCount: item._count._all,
        totalMileage: item._sum.mileage ?? 0,
        averageMileage: Math.round(item._avg.mileage ?? 0),
        totalInsuranceCost: Number((item._sum.insuranceCost ?? 0).toFixed(2)),
        totalLeasingCost: Number((item._sum.contractValue ?? 0).toFixed(2)),
      }))
      .sort((left, right) => right.vehicleCount - left.vehicleCount),
    statusBreakdown: statusBreakdown
      .map((item) => ({
        status: item.status,
        count: item._count._all,
      }))
      .sort((left, right) => right.count - left.count),
    vehiclesOverTime,
    costsOverTime,
    mileageOverTime,
    maintenanceOverTime,
    damageBreakdown,
    alerts: buildNotifications({
      vehicles: activeVehicles.map((vehicle) => ({
        id: vehicle.id,
        model: vehicle.model,
        plate: vehicle.plate,
        status: vehicle.status,
        tuvDate: vehicle.tuvDate,
        insuranceEnd: vehicle.insuranceEnd,
        contractEnd: vehicle.contractEnd,
        company: {
          name: vehicle.company.name,
        },
      })),
      maintenanceRecords,
      documents: expiringDocuments,
    }),
  };
};
