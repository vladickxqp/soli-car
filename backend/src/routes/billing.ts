import express, { NextFunction, Response, Router } from "express";
import { SystemEntityType } from "@prisma/client";
import prisma from "../utils/prisma.js";
import { AuthRequest, authenticate, requireAdmin } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { billingManageSchema, billingQuerySchema } from "../validation/schemas.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import {
  BillingPlan,
  BillingStatus,
  ensureCompanySubscription,
  getCompanyUsageSnapshot,
  getPlanOptions,
} from "../services/billing.js";
import {
  cancelStripeSubscription,
  constructWebhookEvent,
  createCheckoutSession,
  getBillingMode,
  getPlanFromPriceId,
  isStripeEnabled,
  updateStripeSubscriptionPlan,
} from "../services/stripe.js";
import { createAppError } from "../utils/httpError.js";

const router = Router();
export const billingWebhookRouter = Router();
const prismaWithSubscription = prisma as typeof prisma & {
  subscription: {
    upsert: (args: any) => Promise<any>;
    findFirst: (args: any) => Promise<any>;
  };
};

const resolveCompanyId = (req: AuthRequest, requestedCompanyId?: string) =>
  req.user!.isPlatformAdmin && requestedCompanyId ? requestedCompanyId : req.user!.companyId;

const normalizeSubscriptionStatus = (status?: string | null): BillingStatus => {
  if (status === "active" || status === "trialing") {
    return "ACTIVE";
  }

  if (status === "past_due" || status === "unpaid") {
    return "PAST_DUE";
  }

  return "CANCELED";
};

const buildBillingPayload = async (companyId: string) => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!company) {
    throw createAppError(404, "COMPANY_NOT_FOUND", "Company not found");
  }

  const usage = await getCompanyUsageSnapshot(prisma, companyId);

  return {
    company,
    billingMode: getBillingMode(),
    stripeEnabled: isStripeEnabled(),
    subscription: usage.subscription,
    usage: {
      vehicleCount: usage.vehicleCount,
      vehicleLimit: usage.vehicleLimit,
      remainingVehicles: usage.remainingVehicles,
      limitExceeded: usage.limitExceeded,
    },
    plans: getPlanOptions(),
  };
};

const persistSubscriptionState = async (input: {
  companyId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  plan: BillingPlan;
  status: BillingStatus;
  currentPeriodEnd?: Date | null;
  action: string;
  actorUserId?: string | null;
  metadata?: unknown;
}) => {
  const subscription = await prismaWithSubscription.subscription.upsert({
    where: { companyId: input.companyId },
    update: {
      ...(input.stripeCustomerId !== undefined ? { stripeCustomerId: input.stripeCustomerId } : {}),
      ...(input.stripeSubscriptionId !== undefined ? { stripeSubscriptionId: input.stripeSubscriptionId } : {}),
      plan: input.plan,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
    },
    create: {
      companyId: input.companyId,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      plan: input.plan,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
    },
  });

  await createSystemLogFromUnknown(prisma, {
    userId: input.actorUserId ?? null,
    action: input.action,
    entityType: SystemEntityType.COMPANY,
    entityId: input.companyId,
    metadata: input.metadata,
  });

  return subscription;
};

const findCompanyIdForStripeEvent = async (eventObject: any) => {
  const metadataCompanyId = eventObject?.metadata?.companyId;
  if (typeof metadataCompanyId === "string" && metadataCompanyId) {
    return metadataCompanyId;
  }

  const customerId =
    typeof eventObject?.customer === "string" ? eventObject.customer : null;
  const subscriptionId =
    typeof eventObject?.id === "string" && String(eventObject.object).includes("subscription")
      ? eventObject.id
      : typeof eventObject?.subscription === "string"
        ? eventObject.subscription
        : null;

  if (!customerId && !subscriptionId) {
    return null;
  }

  const existing = await prismaWithSubscription.subscription.findFirst({
    where: {
      OR: [
        ...(customerId ? [{ stripeCustomerId: customerId }] : []),
        ...(subscriptionId ? [{ stripeSubscriptionId: subscriptionId }] : []),
      ],
    },
    select: {
      companyId: true,
      stripeCustomerId: true,
    },
  });

  return existing?.companyId ?? null;
};

router.get("/", authenticate, validateQuery(billingQuerySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { companyId } = req.query as unknown as { companyId?: string };
    const resolvedCompanyId = resolveCompanyId(req, companyId);
    const payload = await buildBillingPayload(resolvedCompanyId);
    res.json({ data: payload });
  } catch (error) {
    next(error);
  }
});

router.post("/subscribe", authenticate, requireAdmin, validateBody(billingManageSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const resolvedCompanyId = resolveCompanyId(req, req.body.companyId);
    const company = await prisma.company.findUnique({
      where: { id: resolvedCompanyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return res.status(404).json({
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
      });
    }

    const subscription = await ensureCompanySubscription(prisma, company.id, company.name);

    if (req.body.plan === "FREE") {
      if (subscription.stripeSubscriptionId && isStripeEnabled()) {
        await cancelStripeSubscription(subscription.stripeSubscriptionId);
      }

      await persistSubscriptionState({
        companyId: company.id,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: null,
        plan: "FREE",
        status: "ACTIVE",
        currentPeriodEnd: null,
        action: "BILLING_PLAN_CHANGED",
        actorUserId: req.user!.id,
        metadata: {
          companyId: company.id,
          companyName: company.name,
          plan: "FREE",
          mode: getBillingMode(),
        },
      });

      return res.json({
        data: {
          action: "updated",
          ...await buildBillingPayload(company.id),
        },
      });
    }

    if (!isStripeEnabled()) {
      const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await persistSubscriptionState({
        companyId: company.id,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId:
          subscription.stripeSubscriptionId ??
          `sub_mock_${company.id.replace(/-/g, "").slice(0, 22)}`,
        plan: req.body.plan,
        status: "ACTIVE",
        currentPeriodEnd,
        action: "BILLING_PLAN_CHANGED",
        actorUserId: req.user!.id,
        metadata: {
          companyId: company.id,
          companyName: company.name,
          plan: req.body.plan,
          mode: "mock",
          currentPeriodEnd: currentPeriodEnd.toISOString(),
        },
      });

      return res.json({
        data: {
          action: "updated",
          ...await buildBillingPayload(company.id),
        },
      });
    }

    if (subscription.stripeSubscriptionId) {
      const updatedStripeSubscription = await updateStripeSubscriptionPlan(
        subscription.stripeSubscriptionId,
        req.body.plan,
      ) as any;

      await persistSubscriptionState({
        companyId: company.id,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: updatedStripeSubscription.id,
        plan: req.body.plan,
        status: normalizeSubscriptionStatus(updatedStripeSubscription.status),
        currentPeriodEnd: updatedStripeSubscription.current_period_end
          ? new Date(updatedStripeSubscription.current_period_end * 1000)
          : null,
        action: "BILLING_PLAN_CHANGED",
        actorUserId: req.user!.id,
        metadata: {
          companyId: company.id,
          companyName: company.name,
          plan: req.body.plan,
          mode: "stripe",
          stripeSubscriptionId: updatedStripeSubscription.id,
        },
      });

      return res.json({
        data: {
          action: "updated",
          ...await buildBillingPayload(company.id),
        },
      });
    }

    const checkout = await createCheckoutSession({
      companyId: company.id,
      companyName: company.name,
      customerId: subscription.stripeCustomerId ?? null,
      customerEmail: req.user?.email,
      plan: req.body.plan,
    });

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      action: "BILLING_CHECKOUT_CREATED",
      entityType: SystemEntityType.COMPANY,
      entityId: company.id,
      metadata: {
        companyId: company.id,
        companyName: company.name,
        plan: req.body.plan,
        mode: checkout.mode,
        sessionId: checkout.sessionId,
      },
    });

    res.json({
      data: {
        action: "checkout",
        checkoutUrl: checkout.url,
        sessionId: checkout.sessionId,
        mode: checkout.mode,
        ...await buildBillingPayload(company.id),
      },
    });
  } catch (error) {
    next(error);
  }
});

billingWebhookRouter.post("/", express.raw({ type: "application/json" }), async (req, res, next) => {
  try {
    const event = constructWebhookEvent(req.body, req.headers["stripe-signature"]);

    if (!event) {
      return res.json({ received: true, mode: "mock" });
    }

    const eventObject = event.data.object as any;
    const companyId = await findCompanyIdForStripeEvent(eventObject);

    if (!companyId) {
      return res.json({ received: true, ignored: true });
    }

    const currentSubscription = await ensureCompanySubscription(prisma, companyId);

    if (event.type === "checkout.session.completed") {
      const plan = getPlanFromPriceId(
        eventObject?.metadata?.plan === "ENTERPRISE"
          ? process.env.STRIPE_ENTERPRISE_PRICE_ID
          : eventObject?.metadata?.plan === "PRO"
            ? process.env.STRIPE_PRO_PRICE_ID
            : null,
      );
      const checkoutPlan: BillingPlan =
        eventObject?.metadata?.plan === "PRO" || eventObject?.metadata?.plan === "ENTERPRISE"
          ? eventObject.metadata.plan
          : plan;

      await persistSubscriptionState({
        companyId,
        stripeCustomerId:
          typeof eventObject.customer === "string"
            ? eventObject.customer
            : currentSubscription.stripeCustomerId,
        stripeSubscriptionId:
          typeof eventObject.subscription === "string" ? eventObject.subscription : null,
        plan: checkoutPlan,
        status: "ACTIVE",
        currentPeriodEnd: null,
        action: "BILLING_CHECKOUT_COMPLETED",
        metadata: {
          eventType: event.type,
          checkoutSessionId: eventObject.id,
        },
      });
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const priceId = eventObject?.items?.data?.[0]?.price?.id ?? null;
      await persistSubscriptionState({
        companyId,
        stripeCustomerId:
          typeof eventObject.customer === "string"
            ? eventObject.customer
            : currentSubscription.stripeCustomerId,
        stripeSubscriptionId: typeof eventObject.id === "string" ? eventObject.id : null,
        plan: getPlanFromPriceId(priceId),
        status: normalizeSubscriptionStatus(eventObject.status),
        currentPeriodEnd: eventObject.current_period_end
          ? new Date(eventObject.current_period_end * 1000)
          : null,
        action: "BILLING_SUBSCRIPTION_SYNCED",
        metadata: {
          eventType: event.type,
          priceId,
          stripeSubscriptionId: eventObject.id,
        },
      });
    }

    if (event.type === "customer.subscription.deleted") {
      await persistSubscriptionState({
        companyId,
        stripeCustomerId:
          typeof eventObject.customer === "string"
            ? eventObject.customer
            : currentSubscription.stripeCustomerId,
        stripeSubscriptionId: null,
        plan: "FREE",
        status: "ACTIVE",
        currentPeriodEnd: null,
        action: "BILLING_SUBSCRIPTION_CANCELED",
        metadata: {
          eventType: event.type,
          previousStripeSubscriptionId: eventObject.id,
        },
      });
    }

    if (event.type === "invoice.payment_succeeded") {
      await persistSubscriptionState({
        companyId,
        stripeCustomerId:
          typeof eventObject.customer === "string"
            ? eventObject.customer
            : currentSubscription.stripeCustomerId,
        stripeSubscriptionId:
          typeof eventObject.subscription === "string"
            ? eventObject.subscription
            : currentSubscription.stripeSubscriptionId,
        plan: currentSubscription.plan,
        status: "ACTIVE",
        currentPeriodEnd: currentSubscription.currentPeriodEnd,
        action: "BILLING_PAYMENT_SUCCEEDED",
        metadata: {
          eventType: event.type,
          invoiceId: eventObject.id,
        },
      });
    }

    if (event.type === "invoice.payment_failed") {
      await persistSubscriptionState({
        companyId,
        stripeCustomerId:
          typeof eventObject.customer === "string"
            ? eventObject.customer
            : currentSubscription.stripeCustomerId,
        stripeSubscriptionId:
          typeof eventObject.subscription === "string"
            ? eventObject.subscription
            : currentSubscription.stripeSubscriptionId,
        plan: currentSubscription.plan,
        status: "PAST_DUE",
        currentPeriodEnd: currentSubscription.currentPeriodEnd,
        action: "BILLING_PAYMENT_FAILED",
        metadata: {
          eventType: event.type,
          invoiceId: eventObject.id,
        },
      });
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

export default router;
