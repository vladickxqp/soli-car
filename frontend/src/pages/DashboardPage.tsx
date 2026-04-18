import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchActivity, fetchAnalytics, fetchVehicles, resolveAssetUrl } from "../api";
import ActivityFeedList from "../components/ActivityFeedList";
import EmptyState from "../components/EmptyState";
import LoadingCard from "../components/LoadingCard";
import NotificationPanel from "../components/NotificationPanel";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { getErrorMessage } from "../errors";
import { formatDate, formatNumber } from "../formatters";
import { canManageVehicles } from "../permissions";
import { useAuthStore } from "../store";
import { ActivityFeedItem, DashboardSummary, VehicleListItem } from "../types";

const DashboardPage = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [analytics, setAnalytics] = useState<DashboardSummary | null>(null);
  const [recentVehicles, setRecentVehicles] = useState<VehicleListItem[]>([]);
  const [activity, setActivity] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canEdit = canManageVehicles(user?.role);
  const roleLabel = user?.role ? t(`roles.${user.role}`) : t("common.loading");

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchAnalytics(token),
      fetchVehicles(token, {
        page: 1,
        pageSize: 4,
        sortField: "updatedAt",
        sortOrder: "desc",
      }),
      fetchActivity(token, {
        page: 1,
        pageSize: 5,
      }),
    ])
      .then(([summary, vehiclePage, activityPage]) => {
        if (cancelled) {
          return;
        }

        setAnalytics(summary);
        setRecentVehicles(vehiclePage.items);
        setActivity(activityPage.items);
        setError("");
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
  }, [t, token]);

  const alertSummary = useMemo(() => {
    const notifications = analytics?.notifications ?? [];

    return {
      critical: notifications.filter((item) => item.severity === "red").length,
      warning: notifications.filter((item) => item.severity === "yellow").length,
      stable: notifications.filter((item) => item.severity === "green").length,
    };
  }, [analytics?.notifications]);

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong overflow-hidden">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_420px]">
          <div className="bg-[linear-gradient(135deg,_#0f172a_0%,_#0f766e_100%)] px-6 py-7 text-white sm:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-100">{t("dashboard.kicker")}</p>
            <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{t("dashboard.title")}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">{t("dashboard.subtitle")}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/vehicles" className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
                {t("dashboard.openFleet")}
              </Link>
              <Link
                to={canEdit ? "/new" : "/settings"}
                className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                {canEdit ? t("dashboard.addVehicle") : t("dashboard.viewSettings")}
              </Link>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-5 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(247,250,252,0.96)_100%)] px-6 py-7 sm:px-8">
            <div>
              <p className="shell-kicker">{t("dashboard.workspaceKicker")}</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("dashboard.workspaceTitle")}</h2>
              <p className="mt-2 text-sm text-slate-500">{t("dashboard.workspaceSubtitle")}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("settings.profile.email")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{user?.email}</p>
                <div className="mt-3">
                  <StatusBadge
                    label={user?.emailVerifiedAt ? t("settings.profile.emailVerified") : t("settings.profile.emailPending")}
                    tone={user?.emailVerifiedAt ? "green" : "yellow"}
                  />
                </div>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("settings.profile.role")}</p>
                <div className="mt-2">
                  <StatusBadge label={roleLabel} tone="blue" />
                </div>
                <p className="mt-3 text-xs text-slate-500">{user?.companyName || "-"}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading || !analytics ? (
          <>
            <LoadingCard label={t("dashboard.loadingAnalytics")} />
            <LoadingCard label={t("dashboard.loadingAnalytics")} />
            <LoadingCard label={t("dashboard.loadingAnalytics")} />
            <LoadingCard label={t("dashboard.loadingAnalytics")} />
          </>
        ) : (
          <>
            <StatCard value={analytics.totalVehicles} label={t("dashboard.analytics.totalVehicles")} accent="bg-slate-900" />
            <StatCard value={analytics.activeVehicles} label={t("dashboard.analytics.activeVehicles")} accent="bg-emerald-400" />
            <StatCard value={analytics.inLeasingVehicles} label={t("dashboard.analytics.inLeasing")} accent="bg-sky-400" />
            <StatCard value={analytics.soldVehicles} label={t("dashboard.analytics.sold")} accent="bg-slate-300" />
          </>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <div className="shell-panel p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="shell-kicker">{t("dashboard.analyticsKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("dashboard.analyticsTitle")}</h2>
                <p className="mt-2 text-sm text-slate-500">{t("dashboard.analyticsSubtitle")}</p>
              </div>
              <Link to="/analytics" className="app-btn-secondary">
                {t("dashboard.openAnalytics")}
              </Link>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.analytics.contractEnding")}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">{analytics?.contractEnding ?? 0}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.analytics.tuvExpiring")}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">{analytics?.tuvExpiring ?? 0}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.analytics.insuranceExpiring")}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">{analytics?.insuranceExpiring ?? 0}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.alerts.critical")}</p>
                <p className="mt-3 text-2xl font-semibold text-rose-600">{alertSummary.critical}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.alerts.warning")}</p>
                <p className="mt-3 text-2xl font-semibold text-amber-600">{alertSummary.warning}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.alerts.stable")}</p>
                <p className="mt-3 text-2xl font-semibold text-emerald-600">{alertSummary.stable}</p>
              </div>
            </div>
          </div>

          <div className="shell-panel p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="shell-kicker">{t("dashboard.recentKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("dashboard.recentTitle")}</h2>
                <p className="mt-2 text-sm text-slate-500">{t("dashboard.recentSubtitle")}</p>
              </div>
              <Link to="/vehicles" className="app-btn-secondary">
                {t("dashboard.openFleet")}
              </Link>
            </div>

            {loading ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <LoadingCard label={t("dashboard.loadingVehicles")} />
                <LoadingCard label={t("dashboard.loadingVehicles")} />
              </div>
            ) : recentVehicles.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  title={t("dashboard.table.emptyTitle")}
                  description={t("dashboard.table.emptyDescription")}
                  action={
                    <Link to={canEdit ? "/new" : "/settings"} className="app-btn-primary">
                      {canEdit ? t("dashboard.addVehicle") : t("dashboard.viewSettings")}
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {recentVehicles.map((vehicle) => (
                  <Link key={vehicle.id} to={`/vehicles/${vehicle.id}`} className="shell-muted overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="flex h-full flex-col gap-4 p-4">
                      <div className="flex items-start gap-4">
                        {vehicle.imageUrl ? (
                          <img
                            src={resolveAssetUrl(vehicle.imageUrl)}
                            alt={vehicle.model}
                            className="h-16 w-16 rounded-2xl object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-lg font-semibold text-slate-400">
                            {vehicle.model.slice(0, 2).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-slate-950">{vehicle.model}</p>
                          <p className="mt-1 text-sm text-slate-500">{vehicle.plate}</p>
                        </div>

                        <StatusBadge status={vehicle.status} />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.company")}</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{vehicle.company?.name ?? "-"}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.mileage")}</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{t("units.kilometers", { value: formatNumber(vehicle.mileage) })}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.driver")}</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{vehicle.driver || "-"}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicles.updatedAt")}</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{formatDate(vehicle.updatedAt)}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="shell-panel p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="shell-kicker">{t("activity.kicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("activity.dashboardTitle")}</h2>
                <p className="mt-2 text-sm text-slate-500">{t("activity.dashboardSubtitle")}</p>
              </div>
              <Link to="/activity" className="app-btn-secondary">
                {t("activity.openAll")}
              </Link>
            </div>

            <div className="mt-5">
              {loading ? (
                <div className="space-y-3">
                  <LoadingCard label={t("activity.loading")} />
                  <LoadingCard label={t("activity.loading")} />
                </div>
              ) : (
                <ActivityFeedList
                  items={activity}
                  emptyTitle={t("activity.emptyTitle")}
                  emptyDescription={t("activity.emptyDescription")}
                  compact
                />
              )}
            </div>
          </div>
        </div>

        <NotificationPanel notifications={analytics?.notifications ?? []} />
      </section>
    </div>
  );
};

export default DashboardPage;
