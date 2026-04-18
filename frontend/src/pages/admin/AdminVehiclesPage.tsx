import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  adminDeleteVehicle,
  adminTransferVehicle,
  fetchCompanies,
  fetchVehicles,
  resolveAssetUrl,
} from "../../api";
import EmptyState from "../../components/EmptyState";
import LoadingCard from "../../components/LoadingCard";
import StatusBadge from "../../components/StatusBadge";
import { getErrorMessage } from "../../errors";
import { formatDateTime, formatNumber } from "../../formatters";
import { useAuthStore } from "../../store";
import { Company, PaginationMeta, VehicleListItem, VehicleStatus } from "../../types";

const VEHICLE_STATUSES: VehicleStatus[] = [
  "ACTIVE",
  "IN_SERVICE",
  "UNDER_REPAIR",
  "TRANSFER_PENDING",
  "INACTIVE",
  "DAMAGED",
  "IN_LEASING",
  "SOLD",
  "MAINTENANCE",
  "TRANSFERRED",
  "DISPOSED",
  "ARCHIVED",
];

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

const AdminVehiclesPage = () => {
  const token = useAuthStore((state) => state.token);
  const { t } = useTranslation();

  const [vehicles, setVehicles] = useState<VehicleListItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleListItem | null>(null);
  const [transferCompanyId, setTransferCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta>(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const availableTransferTargets = useMemo(
    () => companies.filter((company) => company.id !== selectedVehicle?.companyId),
    [companies, selectedVehicle?.companyId],
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    fetchCompanies(token)
      .then(setCompanies)
      .catch((loadError) => setError(getErrorMessage(loadError, t)));
  }, [t, token]);

  useEffect(() => {
    setPagination((current) => ({ ...current, page: 1 }));
  }, [companyFilter, search, statusFilter]);

  useEffect(() => {
    if (!selectedVehicle) {
      setTransferCompanyId("");
      return;
    }

    setTransferCompanyId((current) => {
      if (current && availableTransferTargets.some((company) => company.id === current)) {
        return current;
      }

      return availableTransferTargets[0]?.id ?? "";
    });
  }, [availableTransferTargets, selectedVehicle]);

  const refreshVehicles = async () => {
    if (!token) {
      return;
    }

    const response = await fetchVehicles(token, {
      search,
      status: statusFilter || undefined,
      companyId: companyFilter || undefined,
      sortField: "updatedAt",
      sortOrder: "desc",
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    setVehicles(response.items);
    setPagination(response.pagination);
    setSelectedVehicle((current) => {
      if (response.items.length === 0) {
        return null;
      }

      if (!current) {
        return response.items[0];
      }

      return response.items.find((item) => item.id === current.id) ?? response.items[0];
    });
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchVehicles(token, {
      search,
      status: statusFilter || undefined,
      companyId: companyFilter || undefined,
      sortField: "updatedAt",
      sortOrder: "desc",
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }

        setVehicles(response.items);
        setPagination(response.pagination);
        setError("");
        setSelectedVehicle((current) => {
          if (response.items.length === 0) {
            return null;
          }

          if (!current) {
            return response.items[0];
          }

          return response.items.find((item) => item.id === current.id) ?? response.items[0];
        });
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
  }, [companyFilter, pagination.page, pagination.pageSize, search, statusFilter, t, token]);

  const handleTransfer = async () => {
    if (!token || !selectedVehicle || !transferCompanyId) {
      return;
    }

    setActionLoading(true);
    try {
      const result = await adminTransferVehicle(token, selectedVehicle.id, transferCompanyId);
      if (isApprovalResponse(result)) {
        toast.success(t("admin.approvals.requestCreated"));
      } else {
        toast.success(t("admin.vehicles.transferSuccess"));
      }
      await refreshVehicles();
    } catch (transferError) {
      toast.error(getErrorMessage(transferError, t));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !selectedVehicle) {
      return;
    }

    if (!window.confirm(t("admin.vehicles.deleteConfirm", { vehicle: `${selectedVehicle.model} / ${selectedVehicle.plate}` }))) {
      return;
    }

    setActionLoading(true);
    try {
      const result = await adminDeleteVehicle(token, selectedVehicle.id);
      if (isApprovalResponse(result)) {
        toast.success(t("admin.approvals.requestCreated"));
      } else {
        toast.success(t("admin.vehicles.deleteSuccess"));
      }
      await refreshVehicles();
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, t));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <p className="shell-kicker">{t("admin.vehicles.kicker")}</p>
        <h1 className="shell-title mt-3">{t("admin.vehicles.title")}</h1>
        <p className="shell-subtitle">{t("admin.vehicles.subtitle")}</p>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_420px]">
        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <div className="grid gap-3 lg:grid-cols-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("admin.vehicles.searchPlaceholder")}
                className="field-input"
              />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="field-input">
                <option value="">{t("dashboard.allStatuses")}</option>
                {VEHICLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`status.${status}`)}
                  </option>
                ))}
              </select>
              <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className="field-input">
                <option value="">{t("dashboard.allCompanies")}</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          </article>

          <article className="shell-panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
              <div>
                <p className="shell-kicker">{t("admin.vehicles.listKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("admin.vehicles.listTitle")}</h2>
              </div>
              <span className="app-chip">{pagination.total}</span>
            </div>

            {loading ? (
              <div className="p-5">
                <LoadingCard label={t("common.loading")} />
              </div>
            ) : vehicles.length === 0 ? (
              <div className="p-5">
                <EmptyState title={t("admin.vehicles.emptyTitle")} description={t("admin.vehicles.emptyDescription")} />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {vehicles.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => setSelectedVehicle(vehicle)}
                    className={`flex w-full flex-col gap-4 px-5 py-4 text-left transition hover:bg-slate-50 lg:flex-row lg:items-center lg:justify-between ${
                      selectedVehicle?.id === vehicle.id ? "bg-slate-50/90" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      {vehicle.imageUrl ? (
                        <img
                          src={resolveAssetUrl(vehicle.imageUrl)}
                          alt={vehicle.model}
                          className="h-14 w-14 rounded-2xl object-cover shadow-sm"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-400">
                          {vehicle.model.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{vehicle.model}</p>
                        <p className="mt-1 truncate text-sm text-slate-500">
                          {vehicle.plate} / {vehicle.company?.name ?? "-"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="app-chip">{t("units.kilometers", { value: formatNumber(vehicle.mileage) })}</span>
                      <StatusBadge status={vehicle.status} />
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <p className="text-sm text-slate-500">
                {t("dashboard.pagination.pageLabel", { page: pagination.page, totalPages: pagination.totalPages })}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!pagination.hasPreviousPage}
                  onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
                  className="app-btn-secondary"
                >
                  {t("dashboard.pagination.previous")}
                </button>
                <button
                  type="button"
                  disabled={!pagination.hasNextPage}
                  onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
                  className="app-btn-secondary"
                >
                  {t("dashboard.pagination.next")}
                </button>
              </div>
            </div>
          </article>
        </div>

        <article className="shell-panel p-5 sm:p-6">
          {!selectedVehicle ? (
            <EmptyState title={t("admin.vehicles.detailEmptyTitle")} description={t("admin.vehicles.detailEmptyDescription")} />
          ) : (
            <div className="space-y-5">
              <div>
                <p className="shell-kicker">{t("admin.vehicles.detailKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{selectedVehicle.model}</h2>
                <p className="mt-2 text-sm text-slate-500">{selectedVehicle.plate}</p>
              </div>

              <div className="overflow-hidden rounded-[24px] bg-slate-100">
                {selectedVehicle.imageUrl ? (
                  <img
                    src={resolveAssetUrl(selectedVehicle.imageUrl)}
                    alt={selectedVehicle.model}
                    className="h-56 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center text-4xl font-semibold text-slate-300">
                    {selectedVehicle.model.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="shell-muted px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.company")}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{selectedVehicle.company?.name ?? "-"}</p>
                </div>
                <div className="shell-muted px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.status")}</p>
                  <div className="mt-2">
                    <StatusBadge status={selectedVehicle.status} />
                  </div>
                </div>
                <div className="shell-muted px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.vin")}</p>
                  <p className="mt-2 break-all text-sm font-medium text-slate-950">{selectedVehicle.vin}</p>
                </div>
                <div className="shell-muted px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicles.updatedAt")}</p>
                  <p className="mt-2 text-sm font-medium text-slate-950">{formatDateTime(selectedVehicle.updatedAt)}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Link to={`/vehicles/${selectedVehicle.id}`} className="app-btn-secondary justify-center">
                  {t("common.view")}
                </Link>
                <Link to={`/vehicles/${selectedVehicle.id}/edit`} className="app-btn-secondary justify-center">
                  {t("common.edit")}
                </Link>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-950">{t("admin.vehicles.forceTransferTitle")}</p>
                <p className="mt-2 text-sm text-slate-500">{t("admin.vehicles.forceTransferSubtitle")}</p>
                <select
                  value={transferCompanyId}
                  onChange={(event) => setTransferCompanyId(event.target.value)}
                  disabled={availableTransferTargets.length === 0 || actionLoading}
                  className="field-input mt-4"
                >
                  <option value="">{t("admin.vehicles.selectTargetCompany")}</option>
                  {availableTransferTargets.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTransfer}
                  disabled={!transferCompanyId || actionLoading}
                  className="app-btn-primary mt-4 w-full"
                >
                  {actionLoading ? t("common.loading") : t("admin.vehicles.transferAction")}
                </button>
              </div>

              <button type="button" onClick={handleDelete} disabled={actionLoading} className="app-btn-danger w-full">
                {actionLoading ? t("common.loading") : t("common.delete")}
              </button>
            </div>
          )}
        </article>
      </section>
    </div>
  );
};

export default AdminVehiclesPage;
