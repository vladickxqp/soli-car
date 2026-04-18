import Stripe from "stripe";
import { createAppError } from "../utils/httpError.js";
import type { BillingPlan } from "./billing.js";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const appUrl = process.env.APP_URL ?? "http://localhost:5173";

let stripeClient: InstanceType<typeof Stripe> | null = null;

const getStripeClient = () => {
  if (!stripeSecretKey) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(stripeSecretKey);
  }

  return stripeClient;
};

export const getBillingMode = () => (getStripeClient() ? "stripe" : "mock");

export const isStripeEnabled = () => Boolean(getStripeClient());

const getPriceIdForPlan = (plan: BillingPlan) => {
  if (plan === "FREE") {
    return null;
  }

  const priceId =
    plan === "PRO" ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_ENTERPRISE_PRICE_ID;

  if (!priceId) {
    throw createAppError(503, "STRIPE_NOT_CONFIGURED", `Stripe price is not configured for ${plan}`);
  }

  return priceId;
};

export const createBillingCustomer = async (companyId: string, companyName: string) => {
  const stripe = getStripeClient();

  if (!stripe) {
    return `cus_mock_${companyId.replace(/-/g, "").slice(0, 22)}`;
  }

  const customer = await stripe.customers.create({
    name: companyName,
    metadata: {
      companyId,
    },
  });

  return customer.id;
};

export const createCheckoutSession = async (input: {
  companyId: string;
  companyName: string;
  customerId: string | null;
  plan: BillingPlan;
  customerEmail?: string;
}) => {
  if (input.plan === "FREE") {
    throw createAppError(400, "FREE_PLAN_CHECKOUT_BLOCKED", "The free plan does not require Stripe Checkout");
  }

  const stripe = getStripeClient();

  if (!stripe) {
    return {
      url: `${appUrl}/billing?checkout=mock-success&plan=${input.plan}`,
      sessionId: `cs_mock_${input.companyId.replace(/-/g, "").slice(0, 20)}`,
      mode: "mock" as const,
    };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.customerId ?? undefined,
    customer_email: input.customerId ? undefined : input.customerEmail,
    line_items: [
      {
        price: getPriceIdForPlan(input.plan)!,
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/billing?checkout=success&plan=${input.plan}`,
    cancel_url: `${appUrl}/billing?checkout=canceled`,
    metadata: {
      companyId: input.companyId,
      companyName: input.companyName,
      plan: input.plan,
    },
  });

  if (!session.url) {
    throw createAppError(500, "STRIPE_CHECKOUT_FAILED", "Stripe Checkout did not return a redirect URL");
  }

  return {
    url: session.url,
    sessionId: session.id,
    mode: "stripe" as const,
  };
};

export const updateStripeSubscriptionPlan = async (
  stripeSubscriptionId: string,
  plan: BillingPlan,
) => {
  if (plan === "FREE") {
    throw createAppError(400, "FREE_PLAN_UPDATE_BLOCKED", "Use cancellation flow to move to the free plan");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return {
      id: `sub_mock_${stripeSubscriptionId}`,
      current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      status: "active",
    };
  }

  const current = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const itemId = current.items.data[0]?.id;

  if (!itemId) {
    throw createAppError(400, "STRIPE_SUBSCRIPTION_INVALID", "Stripe subscription does not contain a billable item");
  }

  return stripe.subscriptions.update(stripeSubscriptionId, {
    items: [
      {
        id: itemId,
        price: getPriceIdForPlan(plan)!,
      },
    ],
    proration_behavior: "create_prorations",
  });
};

export const cancelStripeSubscription = async (stripeSubscriptionId: string) => {
  const stripe = getStripeClient();
  if (!stripe) {
    return {
      id: `sub_mock_${stripeSubscriptionId}`,
      status: "canceled",
      canceled_at: Math.floor(Date.now() / 1000),
    };
  }

  return stripe.subscriptions.cancel(stripeSubscriptionId);
};

export const constructWebhookEvent = (payload: Buffer, signature?: string | string[]) => {
  const stripe = getStripeClient();

  if (!stripe) {
    return null;
  }

  if (!stripeWebhookSecret) {
    throw createAppError(503, "STRIPE_NOT_CONFIGURED", "Stripe webhook secret is not configured");
  }

  if (!signature || Array.isArray(signature)) {
    throw createAppError(400, "INVALID_STRIPE_SIGNATURE", "Stripe signature is missing");
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, stripeWebhookSecret);
  } catch {
    throw createAppError(400, "INVALID_STRIPE_SIGNATURE", "Stripe webhook signature could not be verified");
  }
};

export const getPlanFromPriceId = (priceId?: string | null): BillingPlan => {
  if (!priceId) {
    return "FREE";
  }

  if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
    return "PRO";
  }

  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) {
    return "ENTERPRISE";
  }

  return "FREE";
};
