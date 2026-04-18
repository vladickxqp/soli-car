import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { changeBillingPlan, fetchBillingSummary, fetchCompanies } from "../api";
import LoadingCard from "../components/LoadingCard";
import StatusBadge from "../components/StatusBadge";
import { getErrorMessage } from "../errors";
import { formatDate } from "../formatters";
import { canManageBilling, canSelectCompanyScope } from "../permissions";
import { useAuthStore } from "../store";
import { BillingSummary, Company, SubscriptionPlan } from "../types";

const statusTone: Record<string, "green" | "yellow" | "red" | "slate"> = {
  ACTIVE: "green",
  PAST_DUE: "yellow",
  CANCELED: "red",
};

const BillingPage = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionPlan, setActionPlan] = useState<SubscriptionPlan | null>(null);
  const [error, setError] = useState("");

  const canManage = canManageBilling(user);
  const canSelectCompany = canSelectCompanyScope(user);

  useEffect(() => {
    const checkoutState = searchParams.get("checkout");
    const checkoutPlan = searchParams.get("plan");

    if (!checkoutState) {
      return;
    }

    if (checkoutState === "success" || checkoutState === "mock-success") {
      toast.success(
        checkoutPlan
          ? t("billing.checkoutSuccessWithPlan", { plan: t(`billing.planNames.${checkoutPlan}`) })
          : t("billing.checkoutSuccess"),
      );
    }

    if (checkoutState === "canceled") {
      toast(t("billing.checkoutCanceled"));
    }

    navigate("/billing", { replace: true });
  }, [navigate, searchParams, t]);

  useEffect(() => {
    if (!token || !canSelectCompany) {
      return;
    }

    fetchCompanies(token)
      .then(setCompanies)
      .catch((loadError) => setError(getErrorMessage(loadError, t)));
  }, [canSelectCompany, t, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchBillingSummary(token, companyFilter || undefined)
      .then((payload) => {
        if (!cancelled) {
          setSummary(payload);
          setError("");
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(getErrorMessage(loadError, t));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companyFilter, t, token]);

  const handlePlanChange = async (plan: SubscriptionPlan) => {
    if (!token || !canManage) {
      return;
    }

    setActionPlan(plan);

    try {
      const response = await changeBillingPlan(token, {
        plan,
        companyId: companyFilter || undefined,
      });

      if (response.action === "checkout" && response.checkoutUrl) {
        window.location.assign(response.checkoutUrl);
        return;
      }

      setSummary(response);
      toast.success(
        plan === "FREE"
          ? t("billing.planDowngraded")
          : t("billing.planUpdated", { plan: t(`billing.planNames.${plan}`) }),
      );
    } catch (actionError) {
      toast.error(getErrorMessage(actionError, t));
    } finally {
      setActionPlan(null);
    }
  };

  const currentPlan = summary?.subscription.plan;
  const vehicleLimit = summary?.usage.vehicleLimit;
  const usagePercent =
    vehicleLimit == null || !summary
      ? 18
      : Math.min(100, Math.round((summary.usage.vehicleCount / Math.max(vehicleLimit, 1)) * 100));

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="shell-kicker">{t("billing.kicker")}</p>
            <h1 className="shell-title mt-3">{t("billing.title")}</h1>
            <p className="shell-subtitle">{t("billing.subtitle")}</p>
          </div>

          {canSelectCompany ? (
            <select
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="field-input max-w-sm"
            >
              <option value="">{t("billing.defaultScope")}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {summary?.billingMode === "mock" ? (
        <section className="rounded-[28px] border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-800">
          <p className="font-semibold">{t("billing.mockModeTitle")}</p>
          <p className="mt-1">{t("billing.mockModeDescription")}</p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading || !summary ? (
          <>
            <LoadingCard label={t("billing.loading")} />
            <LoadingCard label={t("billing.loading")} />
            <LoadingCard label={t("billing.loading")} />
            <LoadingCard label={t("billing.loading")} />
          </>
        ) : (
          <>
            <article className="shell-panel p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("billing.cards.currentPlan")}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{t(`billing.planNames.${summary.subscription.plan}`)}</p>
            </article>
            <article className="shell-panel p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("billing.cards.status")}</p>
              <div className="mt-3">
                <StatusBadge
                  label={t(`billing.status.${summary.subscription.status}`)}
                  tone={statusTone[summary.subscription.status] ?? "slate"}
                />
              </div>
            </article>
            <article className="shell-panel p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("billing.cards.usage")}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">
                {summary.usage.vehicleCount}
                {vehicleLimit == null ? ` / ${t("billing.unlimited")}` : ` / ${vehicleLimit}`}
              </p>
            </article>
            <article className="shell-panel p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("billing.cards.renewal")}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">
                {summary.subscription.currentPeriodEnd ? formatDate(summary.subscription.currentPeriodEnd) : t("billing.noRenewal")}
              </p>
            </article>
          </>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]">
        <article className="shell-panel p-5 sm:p-6">
          <p className="shell-kicker">{t("billing.usageKicker")}</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("billing.usageTitle")}</h2>
          <p className="mt-2 text-sm text-slate-500">{t("billing.usageSubtitle")}</p>

          {loading || !summary ? (
            <div className="mt-5">
              <LoadingCard label={t("billing.loading")} />
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="shell-muted p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{summary.company.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{t("billing.vehicleUsage")}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-600">
                    {summary.usage.vehicleCount}
                    {vehicleLimit == null ? ` / ${t("billing.unlimited")}` : ` / ${vehicleLimit}`}
                  </p>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${
                      summary.usage.limitExceeded ? "bg-rose-500" : usagePercent > 80 ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  ></div>
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  {vehicleLimit == null
                    ? t("billing.unlimitedDescription")
                    : t("billing.remainingVehicles", {
                        count: summary.usage.remainingVehicles ?? 0,
                      })}
                </p>
              </div>

              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("billing.modeLabel")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {summary.billingMode === "stripe" ? t("billing.modeStripe") : t("billing.modeMock")}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {summary.billingMode === "stripe" ? t("billing.modeStripeDescription") : t("billing.modeMockDescription")}
                </p>
              </div>

              {!canManage ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {t("billing.viewerHint")}
                </div>
              ) : null}
            </div>
          )}
        </article>

        <article className="shell-panel p-5 sm:p-6">
          <p className="shell-kicker">{t("billing.planKicker")}</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("billing.planTitle")}</h2>
          <p className="mt-2 text-sm text-slate-500">{t("billing.planSubtitle")}</p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {(summary?.plans ?? []).map((plan) => {
              const isCurrent = currentPlan === plan.plan;
              const isLoadingPlan = actionPlan === plan.plan;

              return (
                <div
                  key={plan.plan}
                  className={`rounded-[26px] border p-5 transition ${
                    isCurrent
                      ? "border-slate-900 bg-slate-950 text-white shadow-xl"
                      : "border-slate-200 bg-white text-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{t(`billing.planNames.${plan.plan}`)}</p>
                      <p className={`mt-2 text-sm ${isCurrent ? "text-slate-300" : "text-slate-500"}`}>
                        {plan.vehicleLimit == null
                          ? t("billing.planLimitUnlimited")
                          : t("billing.planLimit", { count: plan.vehicleLimit })}
                      </p>
                    </div>
                    {isCurrent ? <StatusBadge label={t("billing.currentPlan")} tone="green" /> : null}
                  </div>

                  <ul className={`mt-5 space-y-2 text-sm ${isCurrent ? "text-slate-200" : "text-slate-600"}`}>
                    <li>{t(`billing.features.${plan.plan}.line1`)}</li>
                    <li>{t(`billing.features.${plan.plan}.line2`)}</li>
                    <li>{t(`billing.features.${plan.plan}.line3`)}</li>
                  </ul>

                  <button
                    type="button"
                    disabled={!canManage || isCurrent || isLoadingPlan}
                    title={!canManage ? t("permissions.adminRequired") : undefined}
                    onClick={() => handlePlanChange(plan.plan)}
                    className={`mt-6 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      isCurrent
                        ? "cursor-default bg-white/10 text-white"
                        : "bg-slate-950 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    }`}
                  >
                    {isLoadingPlan
                      ? t("billing.processing")
                      : isCurrent
                        ? t("billing.currentPlan")
                        : t("billing.changePlan")}
                  </button>
                </div>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
};

export default BillingPage;
