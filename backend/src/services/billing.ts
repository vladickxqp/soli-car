import { Prisma, PrismaClient } from "@prisma/client";
import { createAppError } from "../utils/httpError.js";
import { createBillingCustomer } from "./stripe.js";

type DbClient = PrismaClient | Prisma.TransactionClient;
export type BillingPlan = "FREE" | "PRO" | "ENTERPRISE";
export type BillingStatus = "ACTIVE" | "CANCELED" | "PAST_DUE";

const SUBSCRIPTION_LIMITS: Record<BillingPlan, number | null> = {
  FREE: 5,
  PRO: 50,
  ENTERPRISE: null,
};

export const BILLING_PLAN_CONFIG = {
  FREE: {
    vehicleLimit: SUBSCRIPTION_LIMITS.FREE,
    name: "Free",
  },
  PRO: {
    vehicleLimit: SUBSCRIPTION_LIMITS.PRO,
    name: "Pro",
  },
  ENTERPRISE: {
    vehicleLimit: SUBSCRIPTION_LIMITS.ENTERPRISE,
    name: "Enterprise",
  },
} as const;

export const getVehicleLimitForPlan = (plan: BillingPlan) => SUBSCRIPTION_LIMITS[plan];

export const getEffectivePlan = (
  subscription?:
    | {
        plan: BillingPlan;
        status: BillingStatus;
      }
    | null,
) => {
  if (!subscription || subscription.status !== "ACTIVE") {
    return "FREE" as const;
  }

  return subscription.plan;
};

export const ensureCompanySubscription = async (
  db: DbClient,
  companyId: string,
  companyName?: string,
) => {
  const dbWithSubscription = db as DbClient & {
    subscription: {
      findUnique: (args: any) => Promise<any>;
      create: (args: any) => Promise<any>;
    };
  };

  const existingSubscription = await dbWithSubscription.subscription.findUnique({
    where: { companyId },
  });

  if (existingSubscription) {
    return existingSubscription;
  }

  const company =
    companyName
      ? { id: companyId, name: companyName }
      : await db.company.findUnique({
          where: { id: companyId },
          select: {
            id: true,
            name: true,
          },
        });

  if (!company) {
    throw createAppError(404, "COMPANY_NOT_FOUND", "Company not found");
  }

  const stripeCustomerId = await createBillingCustomer(company.id, company.name);

  return dbWithSubscription.subscription.create({
    data: {
      companyId: company.id,
      stripeCustomerId,
      plan: "FREE",
      status: "ACTIVE",
    },
  });
};

export const getCompanyUsageSnapshot = async (db: DbClient, companyId: string) => {
  const [subscription, vehicleCount] = await Promise.all([
    ensureCompanySubscription(db, companyId),
    db.vehicle.count({
      where: {
        companyId,
        deletedAt: null,
      },
    }),
  ]);

  const effectivePlan = getEffectivePlan(subscription);
  const vehicleLimit = getVehicleLimitForPlan(effectivePlan);

  return {
    subscription,
    effectivePlan,
    vehicleCount,
    vehicleLimit,
    remainingVehicles: vehicleLimit == null ? null : Math.max(vehicleLimit - vehicleCount, 0),
    limitExceeded: vehicleLimit != null && vehicleCount >= vehicleLimit,
  };
};

export const assertVehicleCapacity = async (
  db: DbClient,
  companyId: string,
  additionalVehicles = 1,
) => {
  const usage = await getCompanyUsageSnapshot(db, companyId);

  if (
    usage.vehicleLimit != null &&
    usage.vehicleCount + additionalVehicles > usage.vehicleLimit
  ) {
    throw createAppError(
      403,
      "SUBSCRIPTION_LIMIT_EXCEEDED",
      `The ${usage.effectivePlan} plan allows up to ${usage.vehicleLimit} vehicles`,
    );
  }

  return usage;
};

export const getPlanOptions = () =>
  (Object.keys(BILLING_PLAN_CONFIG) as BillingPlan[]).map((plan) => ({
    plan,
    name: BILLING_PLAN_CONFIG[plan].name,
    vehicleLimit: BILLING_PLAN_CONFIG[plan].vehicleLimit,
  }));
