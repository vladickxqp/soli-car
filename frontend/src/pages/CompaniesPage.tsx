import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  createCompanyInvitation,
  fetchAdvancedAnalytics,
  fetchCompanies,
  fetchCompanyWorkspaceDetail,
  revokeCompanyInvitation,
} from "../api";
import EmptyState from "../components/EmptyState";
import LoadingCard from "../components/LoadingCard";
import StatusBadge from "../components/StatusBadge";
import { getErrorMessage } from "../errors";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "../formatters";
import { canManageCompanies } from "../permissions";
import { useAuthStore } from "../store";
import { AdvancedAnalytics, Company, CompanyWorkspaceDetail, UserRole } from "../types";

const INVITABLE_ROLES: UserRole[] = ["MANAGER", "VIEWER", "ADMIN"];

const CompaniesPage = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [workspaceDetail, setWorkspaceDetail] = useState<CompanyWorkspaceDetail | null>(null);
  const [companyAnalytics, setCompanyAnalytics] = useState<AdvancedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingInvitation, setSavingInvitation] = useState(false);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("MANAGER");
  const [inviteExpiry, setInviteExpiry] = useState(7);

  const canViewCompanies = canManageCompanies(user);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );
  const companyBreakdown = companyAnalytics?.vehiclesPerCompany ?? [];
  const totalFleetVehicles = companyAnalytics?.summary.totalVehicles ?? 0;
  const companyAnalyticsById = useMemo(
    () => new Map(companyBreakdown.map((item) => [item.companyId, item])),
    [companyBreakdown],
  );
  const selectedCompanyMetrics = selectedCompany ? companyAnalyticsById.get(selectedCompany.id) ?? null : null;
  const selectedCompanyIncidents =
    workspaceDetail?.vehicles.reduce((sum, vehicle) => sum + (vehicle.incidentCount ?? 0), 0) ?? 0;
  const selectedCompanyArchivedVehicles =
    workspaceDetail?.vehicles.filter(
      (vehicle) => Boolean(vehicle.archivedAt || vehicle.deletedAt || vehicle.status === "ARCHIVED"),
    ).length ?? 0;
  const selectedCompanyShare =
    selectedCompanyMetrics && totalFleetVehicles > 0
      ? Math.round((selectedCompanyMetrics.vehicleCount / totalFleetVehicles) * 100)
      : 0;

  const loadWorkspaceDetail = async (companyId: string) => {
    if (!token) {
      return;
    }

    setDetailLoading(true);
    try {
      const detail = await fetchCompanyWorkspaceDetail(token, companyId);
      setWorkspaceDetail(detail);
    } catch (detailError) {
      toast.error(getErrorMessage(detailError, t));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !canViewCompanies) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([fetchCompanies(token), fetchAdvancedAnalytics(token)])
      .then(([companyData, analytics]) => {
        if (cancelled) {
          return;
        }

        setCompanies(companyData);
        setCompanyAnalytics(analytics);
        const nextCompanyId = companyData[0]?.id ?? "";
        setSelectedCompanyId(nextCompanyId);
        setError("");

        if (nextCompanyId) {
          loadWorkspaceDetail(nextCompanyId);
        } else {
          setWorkspaceDetail(null);
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
  }, [canViewCompanies, t, token]);

  const handleSelectCompany = async (companyId: string) => {
    setSelectedCompanyId(companyId);
    await loadWorkspaceDetail(companyId);
  };

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedCompanyId) {
      return;
    }

    setSavingInvitation(true);
    try {
      const invitation = await createCompanyInvitation(token, selectedCompanyId, {
        email: inviteEmail,
        role: inviteRole,
        expiresInDays: inviteExpiry,
      });

      toast.success(t("companies.invites.created"));

      if (invitation.acceptUrl && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(invitation.acceptUrl);
        toast.success(t("companies.invites.linkCopied"));
      }

      setInviteEmail("");
      setInviteRole("MANAGER");
      setInviteExpiry(7);
      await loadWorkspaceDetail(selectedCompanyId);
    } catch (inviteError) {
      toast.error(getErrorMessage(inviteError, t));
    } finally {
      setSavingInvitation(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!token || !selectedCompanyId) {
      return;
    }

    try {
      await revokeCompanyInvitation(token, selectedCompanyId, invitationId);
      toast.success(t("companies.invites.revoked"));
      await loadWorkspaceDetail(selectedCompanyId);
    } catch (revokeError) {
      toast.error(getErrorMessage(revokeError, t));
    }
  };

  if (!canViewCompanies) {
    return (
      <div className="space-y-6">
        <section className="shell-panel-strong p-6">
          <p className="shell-kicker">{t("companies.kicker")}</p>
          <h1 className="shell-title mt-3">{t("companies.title")}</h1>
          <p className="shell-subtitle">{t("companies.subtitle")}</p>
        </section>

        <section className="shell-panel p-6">
          <EmptyState
            title={t("companies.restrictedTitle")}
            description={t("companies.restrictedDescription")}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="shell-kicker">{t("companies.kicker")}</p>
            <h1 className="shell-title mt-3">{t("companies.title")}</h1>
            <p className="shell-subtitle">{t("companies.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="app-chip">{t("companies.count", { count: companies.length })}</div>
            {companyAnalytics ? (
              <div className="app-chip">
                {t("dashboard.analytics.totalVehicles")}: {formatNumber(companyAnalytics.summary.totalVehicles)}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <article className="shell-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
              <p className="shell-kicker">{t("companies.listKicker")}</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("companies.listTitle")}</h2>
            </div>

            {loading ? (
              <div className="p-5">
                <LoadingCard label={t("companies.loading")} />
              </div>
            ) : companies.length === 0 ? (
              <div className="p-5">
                <EmptyState title={t("companies.emptyTitle")} description={t("companies.emptyDescription")} />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {companies.map((company) => (
                  (() => {
                    const companyMetrics = companyAnalyticsById.get(company.id);
                    const vehicleCount = companyMetrics?.vehicleCount ?? 0;
                    const companyShare =
                      totalFleetVehicles > 0 ? Math.round((vehicleCount / totalFleetVehicles) * 100) : 0;

                    return (
                      <button
                        key={company.id}
                        type="button"
                        onClick={() => handleSelectCompany(company.id)}
                        className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-slate-50 ${
                          selectedCompanyId === company.id ? "bg-slate-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{company.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{company.id}</p>
                          </div>
                          <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                            {formatNumber(vehicleCount)}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                            <span>{t("dashboard.companyVehicles")}</span>
                            <span>{companyShare}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200">
                            <div
                              className="h-2 rounded-full bg-[linear-gradient(90deg,_#0f172a_0%,_#0f766e_100%)] transition-all"
                              style={{ width: `${Math.max(companyShare, vehicleCount > 0 ? 10 : 0)}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    );
                  })()
                ))}
              </div>
            )}
          </article>
        </div>

        <div className="space-y-6">
          {!selectedCompany ? (
            <section className="shell-panel p-6">
              <EmptyState title={t("companies.detailEmptyTitle")} description={t("companies.detailEmptyDescription")} />
            </section>
          ) : (
            <>
              <section className="shell-panel p-5 sm:p-6">
                {detailLoading && !workspaceDetail ? (
                  <LoadingCard label={t("companies.loadingDetail")} />
                ) : workspaceDetail ? (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="shell-kicker">{t("companies.workspaceKicker")}</p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-950">{workspaceDetail.name}</h2>
                        <p className="mt-2 text-sm text-slate-500">{t("companies.workspaceSubtitle")}</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="shell-muted px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("companies.stats.members")}</p>
                          <p className="mt-2 text-xl font-semibold text-slate-950">{workspaceDetail.users.length}</p>
                        </div>
                        <div className="shell-muted px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("companies.stats.vehicles")}</p>
                          <p className="mt-2 text-xl font-semibold text-slate-950">{workspaceDetail.vehicles.length}</p>
                        </div>
                        <div className="shell-muted px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("companies.stats.pendingInvites")}</p>
                          <p className="mt-2 text-xl font-semibold text-slate-950">
                            {workspaceDetail.invitations.filter((invitation) => invitation.status === "PENDING").length}
                          </p>
                        </div>
                        <div className="shell-muted px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.incidentCount")}</p>
                          <p className="mt-2 text-xl font-semibold text-slate-950">{formatNumber(selectedCompanyIncidents)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
                      <div className="space-y-6">
                        <article className="shell-muted p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("companies.membersTitle")}</p>
                          <div className="mt-4 space-y-3">
                            {workspaceDetail.users.map((member) => (
                              <div key={member.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950">{member.email}</p>
                                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(member.createdAt)}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusBadge label={t(`roles.${member.role}`)} tone="blue" />
                                  {member.isPlatformAdmin ? <StatusBadge label={t("settings.profile.platformAdmin")} tone="red" /> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </article>

                        <article className="shell-muted p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("companies.invites.title")}</p>
                            <span className="app-chip">{workspaceDetail.invitations.length}</span>
                          </div>

                          <div className="mt-4 space-y-3">
                            {workspaceDetail.invitations.length === 0 ? (
                              <EmptyState title={t("companies.invites.emptyTitle")} description={t("companies.invites.emptyDescription")} />
                            ) : (
                              workspaceDetail.invitations.map((invitation) => (
                                <div key={invitation.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-950">{invitation.email}</p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {t(`roles.${invitation.role}`)} / {formatDate(invitation.expiresAt)}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <StatusBadge label={t(`companies.invites.status.${invitation.status}`)} tone={invitation.status === "PENDING" ? "yellow" : invitation.status === "ACCEPTED" ? "green" : "red"} />
                                      {invitation.status === "PENDING" ? (
                                        <button type="button" onClick={() => handleRevokeInvitation(invitation.id)} className="app-btn-ghost">
                                          {t("companies.invites.revokeAction")}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </article>
                      </div>

                      <div className="space-y-6">
                        <article className="shell-muted p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.companiesKicker")}</p>
                              <h3 className="mt-2 text-lg font-semibold text-slate-950">{selectedCompany?.name}</h3>
                              <p className="mt-2 text-sm text-slate-500">
                                {selectedCompanyMetrics
                                  ? t("dashboard.companyOwnership", {
                                      count: formatNumber(selectedCompanyMetrics.vehicleCount),
                                    })
                                  : t("companies.workspaceSubtitle")}
                              </p>
                            </div>
                            <div className="app-chip">{selectedCompanyShare}%</div>
                          </div>

                          {selectedCompanyMetrics ? (
                            <>
                              <div className="mt-4 h-2 rounded-full bg-slate-200">
                                <div
                                  className="h-2 rounded-full bg-[linear-gradient(90deg,_#0f172a_0%,_#0f766e_100%)]"
                                  style={{ width: `${Math.max(selectedCompanyShare, selectedCompanyMetrics.vehicleCount > 0 ? 10 : 0)}%` }}
                                />
                              </div>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl bg-white px-4 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.companyMileage")}</p>
                                  <p className="mt-2 text-sm font-medium text-slate-900">
                                    {t("units.kilometers", { value: formatNumber(selectedCompanyMetrics.totalMileage) })}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-white px-4 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.companyAverageMileage")}</p>
                                  <p className="mt-2 text-sm font-medium text-slate-900">
                                    {t("units.kilometers", { value: formatNumber(selectedCompanyMetrics.averageMileage) })}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-white px-4 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.companyCost")}</p>
                                  <p className="mt-2 text-sm font-medium text-slate-900">
                                    {formatCurrency(selectedCompanyMetrics.totalLeasingCost + selectedCompanyMetrics.totalInsuranceCost)}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-white px-4 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicles.archivedBadge")}</p>
                                  <p className="mt-2 text-sm font-medium text-slate-900">{formatNumber(selectedCompanyArchivedVehicles)}</p>
                                </div>
                              </div>
                            </>
                          ) : null}
                        </article>

                        <article className="shell-muted p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("companies.invites.createKicker")}</p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-950">{t("companies.invites.createTitle")}</h3>
                          <p className="mt-2 text-sm text-slate-500">{t("companies.invites.createSubtitle")}</p>

                          <form className="mt-5 space-y-4" onSubmit={handleInvite}>
                            <label className="block text-sm font-medium text-slate-700">
                              {t("auth.email")}
                              <input
                                value={inviteEmail}
                                onChange={(event) => setInviteEmail(event.target.value)}
                                type="email"
                                className="field-input mt-2"
                                required
                              />
                            </label>

                            <label className="block text-sm font-medium text-slate-700">
                              {t("settings.profile.role")}
                              <select
                                value={inviteRole}
                                onChange={(event) => setInviteRole(event.target.value as UserRole)}
                                className="field-input mt-2"
                              >
                                {INVITABLE_ROLES.map((role) => (
                                  <option key={role} value={role}>
                                    {t(`roles.${role}`)}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block text-sm font-medium text-slate-700">
                              {t("companies.invites.expiresIn")}
                              <select
                                value={String(inviteExpiry)}
                                onChange={(event) => setInviteExpiry(Number(event.target.value))}
                                className="field-input mt-2"
                              >
                                <option value="3">3</option>
                                <option value="7">7</option>
                                <option value="14">14</option>
                                <option value="30">30</option>
                              </select>
                            </label>

                            <button type="submit" disabled={savingInvitation} className="app-btn-primary w-full">
                              {savingInvitation ? t("common.loading") : t("companies.invites.createAction")}
                            </button>
                          </form>
                        </article>

                        <article className="shell-muted p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("companies.vehiclesTitle")}</p>
                          <div className="mt-4 space-y-3">
                            {workspaceDetail.vehicles.length === 0 ? (
                              <EmptyState title={t("companies.noVehiclesTitle")} description={t("companies.noVehiclesDescription")} />
                            ) : (
                              workspaceDetail.vehicles.slice(0, 5).map((vehicle) => (
                                <div key={vehicle.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-950">{vehicle.model}</p>
                                      <p className="mt-1 text-xs text-slate-500">{vehicle.plate} / {vehicle.driver}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <StatusBadge status={vehicle.status} />
                                      {vehicle.incidentCount ? <StatusBadge label={t("vehicle.accidentHistory")} tone="yellow" /> : null}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </article>
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState title={t("companies.detailEmptyTitle")} description={t("companies.detailEmptyDescription")} />
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default CompaniesPage;
