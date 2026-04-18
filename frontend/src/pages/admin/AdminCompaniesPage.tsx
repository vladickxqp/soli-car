import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  createAdminCompany,
  deleteAdminCompany,
  fetchAdminCompanies,
  fetchAdminCompany,
  updateAdminCompany,
} from "../../api";
import EmptyState from "../../components/EmptyState";
import LoadingCard from "../../components/LoadingCard";
import StatusBadge from "../../components/StatusBadge";
import { getErrorMessage } from "../../errors";
import { formatDateTime } from "../../formatters";
import { useAuthStore } from "../../store";
import { AdminCompanyDetail, AdminCompanyListItem, PaginationMeta } from "../../types";

const defaultPagination: PaginationMeta = {
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

const isApprovalResponse = (value: unknown): value is { action: "approval_requested"; approval: { id: string } } =>
  Boolean(
    value &&
    typeof value === "object" &&
    "action" in value &&
    (value as { action?: string }).action === "approval_requested",
  );

const AdminCompaniesPage = () => {
  const token = useAuthStore((state) => state.token);
  const { t } = useTranslation();

  const [companies, setCompanies] = useState<AdminCompanyListItem[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<AdminCompanyDetail | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta>(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchAdminCompanies(token, {
      search,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setCompanies(result.items);
        setPagination(result.pagination);
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
  }, [pagination.page, pagination.pageSize, search, t, token]);

  const refreshCompanies = async () => {
    if (!token) {
      return;
    }

    const result = await fetchAdminCompanies(token, {
      search,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    setCompanies(result.items);
    setPagination(result.pagination);
  };

  const handleSelectCompany = async (companyId: string) => {
    if (!token) {
      return;
    }

    try {
      const detail = await fetchAdminCompany(token, companyId);
      setSelectedCompany(detail);
      setCompanyName(detail.name);
    } catch (detailError) {
      toast.error(getErrorMessage(detailError, t));
    }
  };

  const handleStartCreate = () => {
    setSelectedCompany(null);
    setCompanyName("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setSaving(true);
    try {
      if (selectedCompany) {
        await updateAdminCompany(token, selectedCompany.id, companyName);
        toast.success(t("admin.companies.updated"));
        await handleSelectCompany(selectedCompany.id);
      } else {
        const company = await createAdminCompany(token, companyName);
        toast.success(t("admin.companies.created"));
        await handleSelectCompany(company.id);
      }

      await refreshCompanies();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, t));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !selectedCompany) {
      return;
    }

    if (!window.confirm(t("admin.companies.deleteConfirm", { name: selectedCompany.name }))) {
      return;
    }

    try {
      const result = await deleteAdminCompany(token, selectedCompany.id);
      if (isApprovalResponse(result)) {
        toast.success(t("admin.approvals.requestCreated"));
      } else {
        toast.success(t("admin.companies.deleted"));
        handleStartCreate();
      }
      await refreshCompanies();
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, t));
    }
  };

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="shell-kicker">{t("admin.companies.kicker")}</p>
            <h1 className="shell-title mt-3">{t("admin.companies.title")}</h1>
            <p className="shell-subtitle">{t("admin.companies.subtitle")}</p>
          </div>
          <button type="button" onClick={handleStartCreate} className="app-btn-primary">
            {t("admin.companies.createAction")}
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_460px]">
        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
              placeholder={t("admin.companies.searchPlaceholder")}
              className="field-input"
            />
          </article>

          <article className="shell-panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
              <div>
                <p className="shell-kicker">{t("admin.companies.listKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("admin.companies.listTitle")}</h2>
              </div>
              <span className="app-chip">{pagination.total}</span>
            </div>

            {loading ? (
              <div className="p-5">
                <LoadingCard label={t("common.loading")} />
              </div>
            ) : companies.length === 0 ? (
              <div className="p-5">
                <EmptyState title={t("admin.companies.emptyTitle")} description={t("admin.companies.emptyDescription")} />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => handleSelectCompany(company.id)}
                    className="flex w-full flex-col gap-4 px-5 py-4 text-left transition hover:bg-slate-50 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{company.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{formatDateTime(company.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="app-chip">{t("admin.companies.userCount", { count: company.userCount })}</span>
                      <span className="app-chip">{t("admin.companies.vehicleCount", { count: company.vehicleCount })}</span>
                      <StatusBadge label={t("admin.companies.openTickets", { count: company.openTicketCount })} tone={company.openTicketCount > 0 ? "yellow" : "green"} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </article>
        </div>

        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{selectedCompany ? t("admin.companies.editKicker") : t("admin.companies.createKicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              {selectedCompany ? t("admin.companies.editTitle") : t("admin.companies.createTitle")}
            </h2>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-slate-700">
                {t("auth.companyName")}
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="field-input mt-2"
                  required
                />
              </label>

              <button type="submit" disabled={saving} className="app-btn-primary w-full">
                {saving ? t("common.loading") : selectedCompany ? t("form.saveChanges") : t("admin.companies.createAction")}
              </button>

              {selectedCompany ? (
                <button type="button" onClick={handleDelete} className="app-btn-danger w-full">
                  {t("common.delete")}
                </button>
              ) : null}
            </form>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            {!selectedCompany ? (
              <EmptyState title={t("admin.companies.detailEmptyTitle")} description={t("admin.companies.detailEmptyDescription")} />
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="shell-kicker">{t("admin.companies.detailKicker")}</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">{selectedCompany.name}</h2>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-900">{t("admin.companies.usersTitle")}</p>
                  <div className="mt-3 space-y-2">
                    {selectedCompany.users.length === 0 ? (
                      <p className="text-sm text-slate-500">{t("admin.companies.noUsers")}</p>
                    ) : (
                      selectedCompany.users.map((user) => (
                        <div key={user.id} className="shell-muted flex items-center justify-between gap-3 px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{user.email}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatDateTime(user.createdAt)}</p>
                          </div>
                          <StatusBadge label={t(`roles.${user.role}`)} tone="blue" />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-900">{t("admin.companies.vehiclesTitle")}</p>
                  <div className="mt-3 space-y-2">
                    {selectedCompany.vehicles.length === 0 ? (
                      <p className="text-sm text-slate-500">{t("admin.companies.noVehicles")}</p>
                    ) : (
                      selectedCompany.vehicles.map((vehicle) => (
                        <div key={vehicle.id} className="shell-muted flex items-center justify-between gap-3 px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{vehicle.model}</p>
                            <p className="mt-1 text-xs text-slate-500">{vehicle.plate} / {vehicle.driver}</p>
                          </div>
                          <StatusBadge status={vehicle.status} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
};

export default AdminCompaniesPage;
