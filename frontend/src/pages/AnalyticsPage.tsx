import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchAdvancedAnalytics, fetchCompanies } from "../api";
import EmptyState from "../components/EmptyState";
import LoadingCard from "../components/LoadingCard";
import NotificationPanel from "../components/NotificationPanel";
import StatCard from "../components/StatCard";
import { getErrorMessage } from "../errors";
import { formatCurrency, formatNumber } from "../formatters";
import { canSelectCompanyScope } from "../permissions";
import { useAuthStore } from "../store";
import { AdvancedAnalytics, Company } from "../types";

const chartPalette = {
  teal: "#0f766e",
  navy: "#0f172a",
  sky: "#38bdf8",
  amber: "#f59e0b",
  slate: "#64748b",
  rose: "#f43f5e",
};

const AnalyticsPage = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [analytics, setAnalytics] = useState<AdvancedAnalytics | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canSeeCompanies = canSelectCompanyScope(user);

  useEffect(() => {
    if (!token || !canSeeCompanies) {
      return;
    }

    fetchCompanies(token)
      .then(setCompanies)
      .catch((loadError) => setError(getErrorMessage(loadError, t)));
  }, [canSeeCompanies, t, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchAdvancedAnalytics(token, companyFilter || undefined)
      .then((payload) => {
        if (!cancelled) {
          setAnalytics(payload);
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

  const isEmpty = !loading && (analytics?.summary.totalVehicles ?? 0) === 0;

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="shell-kicker">{t("analytics.kicker")}</p>
            <h1 className="shell-title mt-3">{t("analytics.title")}</h1>
            <p className="shell-subtitle">{t("analytics.subtitle")}</p>
          </div>

          {canSeeCompanies ? (
            <select
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="field-input max-w-sm"
            >
              <option value="">{t("dashboard.allCompanies")}</option>
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {loading || !analytics ? (
          <>
            <LoadingCard label={t("dashboard.loadingAnalytics")} />
            <LoadingCard label={t("dashboard.loadingAnalytics")} />
            <LoadingCard label={t("dashboard.loadingAnalytics")} />
            <LoadingCard label={t("dashboard.loadingAnalytics")} />
            <LoadingCard label={t("dashboard.loadingAnalytics")} />
            <LoadingCard label={t("dashboard.loadingAnalytics")} />
          </>
        ) : (
          <>
            <StatCard value={analytics.summary.totalVehicles} label={t("analytics.cards.totalVehicles")} accent="bg-slate-900" />
            <StatCard value={formatCurrency(analytics.summary.totalCost)} label={t("analytics.cards.totalCost")} accent="bg-teal-500" />
            <StatCard value={formatNumber(analytics.summary.totalMileage)} label={t("analytics.cards.totalMileage")} accent="bg-sky-400" />
            <StatCard
              value={analytics.summary.expiringTuvCount + analytics.summary.expiringInsuranceCount}
              label={t("analytics.cards.expiring")}
              accent="bg-amber-400"
            />
            <StatCard
              value={analytics.summary.vehiclesWithAccidents}
              label={t("analytics.cards.accidents")}
              accent="bg-rose-500"
            />
            <StatCard
              value={formatCurrency(analytics.summary.totalMaintenanceCost)}
              label={t("analytics.cards.maintenanceCost")}
              accent="bg-emerald-500"
            />
          </>
        )}
      </section>

      {isEmpty ? (
        <div className="shell-panel p-6">
          <EmptyState title={t("analytics.emptyTitle")} description={t("analytics.emptyDescription")} />
        </div>
      ) : null}

      {!isEmpty ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)]">
          <div className="space-y-6">
            <article className="shell-panel p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="shell-kicker">{t("analytics.growthKicker")}</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("analytics.growthTitle")}</h2>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                  <span>{t("analytics.legend.newVehicles")}</span>
                  <span>{t("analytics.legend.cumulativeFleet")}</span>
                </div>
              </div>

              <div className="mt-5 h-[320px]">
                {loading || !analytics ? (
                  <LoadingCard label={t("dashboard.loadingAnalytics")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.vehiclesOverTime}>
                      <defs>
                        <linearGradient id="fleetGradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="5%" stopColor={chartPalette.teal} stopOpacity={0.32} />
                          <stop offset="95%" stopColor={chartPalette.teal} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="cumulativeVehicles"
                        name={t("analytics.legend.cumulativeFleet")}
                        stroke={chartPalette.teal}
                        fill="url(#fleetGradient)"
                        strokeWidth={2.5}
                      />
                      <Area
                        type="monotone"
                        dataKey="vehicles"
                        name={t("analytics.legend.newVehicles")}
                        stroke={chartPalette.navy}
                        fillOpacity={0}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>

            <article className="shell-panel p-5 sm:p-6">
              <div>
                <p className="shell-kicker">{t("analytics.costsKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("analytics.costsTitle")}</h2>
                <p className="mt-2 text-sm text-slate-500">{t("analytics.costsSubtitle")}</p>
              </div>

              <div className="mt-5 h-[320px]">
                {loading || !analytics ? (
                  <LoadingCard label={t("dashboard.loadingAnalytics")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.costsOverTime}>
                      <CartesianGrid vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatNumber(Number(value))} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                      <Legend />
                      <Bar dataKey="leasingCost" stackId="costs" name={t("analytics.legend.leasingCost")} fill={chartPalette.navy} radius={[8, 8, 0, 0]} />
                      <Bar dataKey="insuranceCost" stackId="costs" name={t("analytics.legend.insuranceCost")} fill={chartPalette.sky} radius={[8, 8, 0, 0]} />
                      <Bar dataKey="taxCost" stackId="costs" name={t("analytics.legend.taxCost")} fill={chartPalette.amber} radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>

            <article className="shell-panel p-5 sm:p-6">
              <div>
                <p className="shell-kicker">{t("analytics.mileageKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("analytics.mileageTitle")}</h2>
                <p className="mt-2 text-sm text-slate-500">{t("analytics.mileageSubtitle")}</p>
              </div>

              <div className="mt-5 h-[320px]">
                {loading || !analytics ? (
                  <LoadingCard label={t("dashboard.loadingAnalytics")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.mileageOverTime}>
                      <CartesianGrid vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatNumber(Number(value))} />
                      <Tooltip formatter={(value) => formatNumber(Number(value ?? 0))} />
                      <Legend />
                      <Line type="monotone" dataKey="projectedMileage" name={t("analytics.legend.projectedMileage")} stroke={chartPalette.teal} strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="averageMileage" name={t("analytics.legend.averageMileage")} stroke={chartPalette.rose} strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>

            <article className="shell-panel p-5 sm:p-6">
              <div>
                <p className="shell-kicker">{t("analytics.maintenanceKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("analytics.maintenanceTitle")}</h2>
                <p className="mt-2 text-sm text-slate-500">{t("analytics.maintenanceSubtitle")}</p>
              </div>

              <div className="mt-5 h-[320px]">
                {loading || !analytics ? (
                  <LoadingCard label={t("dashboard.loadingAnalytics")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.maintenanceOverTime}>
                      <CartesianGrid vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value, name) => (name === "cost" ? formatCurrency(Number(value ?? 0)) : formatNumber(Number(value ?? 0)))} />
                      <Legend />
                      <Bar dataKey="events" name={t("analytics.legend.maintenanceEvents")} fill={chartPalette.teal} radius={[8, 8, 0, 0]} />
                      <Bar dataKey="cost" name={t("analytics.legend.maintenanceCost")} fill={chartPalette.amber} radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>
          </div>

          <div className="space-y-6">
            <article className="shell-panel p-5 sm:p-6">
              <p className="shell-kicker">{t("analytics.distributionKicker")}</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("analytics.distributionTitle")}</h2>

              <div className="mt-5 h-[280px]">
                {loading || !analytics ? (
                  <LoadingCard label={t("dashboard.loadingAnalytics")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.vehiclesPerCompany}>
                      <CartesianGrid vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="companyName" tickLine={false} axisLine={false} hide={!canSeeCompanies} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => formatNumber(Number(value ?? 0))} />
                      <Bar dataKey="vehicleCount" name={t("analytics.legend.vehicles")} fill={chartPalette.navy} radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>

            <article className="shell-panel p-5 sm:p-6">
              <p className="shell-kicker">{t("analytics.statusKicker")}</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("analytics.statusTitle")}</h2>

              <div className="mt-5 space-y-3">
                {(analytics?.statusBreakdown ?? []).map((entry) => (
                  <div key={entry.status} className="shell-muted p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{t(`status.${entry.status}`)}</p>
                      <span className="text-sm font-semibold text-slate-500">{formatNumber(entry.count)}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-slate-900"
                        style={{
                          width: `${Math.min(
                            100,
                            analytics?.summary.totalVehicles
                              ? (entry.count / analytics.summary.totalVehicles) * 100
                              : 0,
                          )}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="shell-panel p-5 sm:p-6">
              <p className="shell-kicker">{t("analytics.damageKicker")}</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("analytics.damageTitle")}</h2>
              <p className="mt-2 text-sm text-slate-500">{t("analytics.damageSubtitle")}</p>

              <div className="mt-5 h-[260px]">
                {loading || !analytics ? (
                  <LoadingCard label={t("dashboard.loadingAnalytics")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.damageBreakdown}>
                      <CartesianGrid vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => formatNumber(Number(value ?? 0))} />
                      <Bar dataKey="count" name={t("analytics.legend.vehicles")} fill={chartPalette.rose} radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {!loading && analytics ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="shell-muted p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("analytics.cards.accidents")}</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{formatNumber(analytics.summary.vehiclesWithAccidents)}</p>
                  </div>
                  <div className="shell-muted p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("analytics.cards.serviceReminders")}</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{formatNumber(analytics.summary.upcomingServiceReminders)}</p>
                  </div>
                </div>
              ) : null}
            </article>

            <NotificationPanel notifications={analytics?.alerts ?? []} />
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default AnalyticsPage;
