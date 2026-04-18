import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  archiveVehicle,
  fetchCompanies,
  fetchHistory,
  fetchVehicle,
  fetchVehicles,
  importVehicles,
  restoreVehicle,
  resolveAssetUrl,
} from "../api";
import EmptyState from "../components/EmptyState";
import LoadingCard from "../components/LoadingCard";
import SkeletonBlock from "../components/SkeletonBlock";
import StatusBadge from "../components/StatusBadge";
import { getErrorMessage } from "../errors";
import { formatDate, formatNumber } from "../formatters";
import {
  canSelectCompanyScope,
  canManageVehicles,
  canTransferVehicles,
} from "../permissions";
import {
  getStoredVehicleViewPreference,
  setStoredVehicleViewPreference,
} from "../preferences";
import { useAuthStore } from "../store";
import { Company, PaginationMeta, VehicleListItem, VehicleStatus } from "../types";
import { exportVehiclePdfLazy } from "../utils/exportVehiclePdfLazy";

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 48];

type ViewMode = "table" | "cards";
type ArchivedView = "active" | "archived" | "all";

type ActionTone = "neutral" | "accent" | "danger";

const actionToneClasses: Record<ActionTone, string> = {
  neutral: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
  accent: "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100",
  danger: "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100",
};

const VEHICLE_STATUS_OPTIONS: VehicleStatus[] = [
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

const getDamageTone = (status: VehicleListItem["damageStatus"]): "blue" | "green" | "yellow" | "red" => {
  switch (status) {
    case "REPORTED":
      return "red";
    case "UNDER_REPAIR":
      return "yellow";
    case "REPAIRED":
      return "green";
    default:
      return "blue";
  }
};

interface VehicleActionProps {
  label: string;
  to?: string;
  onClick?: () => void;
  tone?: ActionTone;
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
}

const VehicleAction = ({
  label,
  to,
  onClick,
  tone = "neutral",
  disabled = false,
  disabledReason,
  loading = false,
}: VehicleActionProps) => {
  const className = `inline-flex items-center justify-center rounded-full border px-3 py-2 text-xs font-semibold transition ${actionToneClasses[tone]} ${
    disabled ? "cursor-not-allowed opacity-45" : ""
  }`;

  if (to && !disabled) {
    return (
      <Link to={to} className={className}>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={disabled ? disabledReason : undefined}
      className={className}
    >
      {label}
    </button>
  );
};

const VehiclesPage = () => {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [vehicles, setVehicles] = useState<VehicleListItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [archivedView, setArchivedView] = useState<ArchivedView>("active");
  const [companyFilter, setCompanyFilter] = useState("");
  const [sortField, setSortField] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [viewMode, setViewMode] = useState<ViewMode>(() => getStoredVehicleViewPreference());
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const canEdit = canManageVehicles(user?.role);
  const canTransfer = canTransferVehicles(user);
  const canSeeCompanies = canSelectCompanyScope(user);
  const roleLabel = user?.role ? t(`roles.${user.role}`) : t("common.loading");

  const rangeLabel = useMemo(() => {
    if (pagination.total === 0) {
      return t("dashboard.pagination.empty");
    }

    const from = (pagination.page - 1) * pagination.pageSize + 1;
    const to = Math.min(pagination.page * pagination.pageSize, pagination.total);

    return t("dashboard.pagination.range", {
      from,
      to,
      total: pagination.total,
    });
  }, [pagination, t]);

  const handleViewModeChange = (value: ViewMode) => {
    setStoredVehicleViewPreference(value);
    setViewMode(value);
  };

  useEffect(() => {
    if (!token || !canSeeCompanies) {
      return;
    }

    let cancelled = false;
    fetchCompanies(token)
      .then((companyData) => {
        if (!cancelled) {
          setCompanies(companyData);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(getErrorMessage(loadError, t));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canSeeCompanies, t, token]);

  useEffect(() => {
    setPage(1);
  }, [archivedView, companyFilter, pageSize, search, statusFilter]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timeoutId = window.setTimeout(() => {
      fetchVehicles(token, {
        search,
        status: statusFilter,
        archived: archivedView,
        companyId: companyFilter || undefined,
        sortField,
        sortOrder,
        page,
        pageSize,
      })
        .then((response) => {
          if (cancelled) {
            return;
          }

          setVehicles(response.items);
          setPagination(response.pagination);
          setPage((current) => (current === response.pagination.page ? current : response.pagination.page));
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
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [archivedView, companyFilter, page, pageSize, search, sortField, sortOrder, statusFilter, t, token]);

  const refreshVehicles = async () => {
    if (!token) {
      return;
    }

    const response = await fetchVehicles(token, {
      search,
      status: statusFilter,
      archived: archivedView,
      companyId: companyFilter || undefined,
      sortField,
      sortOrder,
      page,
      pageSize,
    });

    setVehicles(response.items);
    setPagination(response.pagination);
    setPage((current) => (current === response.pagination.page ? current : response.pagination.page));
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortOrder("asc");
  };

  const handleArchive = async (vehicle: VehicleListItem) => {
    if (!token || !canEdit) {
      return;
    }

    if (!window.confirm(t("vehicles.archiveConfirm", { vehicle: `${vehicle.model} / ${vehicle.plate}` }))) {
      return;
    }

    const reason = window.prompt(t("vehicles.archiveReasonPrompt"), vehicle.archiveReason ?? "");
    if (reason === null) {
      return;
    }

    try {
      await archiveVehicle(token, vehicle.id, reason || undefined);
      toast.success(t("vehicles.archiveSuccess"));
      await refreshVehicles();
    } catch (archiveError) {
      toast.error(getErrorMessage(archiveError, t));
    }
  };

  const handleRestore = async (vehicle: VehicleListItem) => {
    if (!token || !canEdit) {
      return;
    }

    if (!window.confirm(t("vehicles.restoreConfirm", { vehicle: `${vehicle.model} / ${vehicle.plate}` }))) {
      return;
    }

    try {
      await restoreVehicle(token, vehicle.id);
      toast.success(t("vehicles.restoreSuccess"));
      await refreshVehicles();
    } catch (restoreError) {
      toast.error(getErrorMessage(restoreError, t));
    }
  };

  const handleImport = async () => {
    if (!token || !canEdit) {
      return;
    }

    if (!importFile) {
      toast.error(t("dashboard.import.selectFile"));
      return;
    }

    try {
      const result = await importVehicles(token, importFile, companyFilter || undefined);
      toast.success(t("dashboard.import.success", { count: result.imported }));
      setImportFile(null);
      await refreshVehicles();
    } catch (importError) {
      toast.error(getErrorMessage(importError, t));
    }
  };

  const handleExport = async (vehicleId: string) => {
    if (!token) {
      return;
    }

    setExportingId(vehicleId);
    const toastId = toast.loading(t("pdf.preparing"));

    try {
      const [vehicle, history] = await Promise.all([
        fetchVehicle(token, vehicleId),
        fetchHistory(token, vehicleId),
      ]);
      await exportVehiclePdfLazy({ vehicle, history, t });
      toast.success(t("pdf.ready"), { id: toastId });
    } catch (exportError) {
      toast.error(getErrorMessage(exportError, t), { id: toastId });
    } finally {
      setExportingId((current) => (current === vehicleId ? null : current));
    }
  };

  const renderActions = (vehicle: VehicleListItem) => {
    const isArchived = Boolean(vehicle.archivedAt || vehicle.deletedAt || vehicle.status === "ARCHIVED");

    return (
      <div className="flex flex-wrap gap-2">
        <VehicleAction label={t("common.view")} to={`/vehicles/${vehicle.id}`} />
        <VehicleAction
          label={t("common.edit")}
          to={`/vehicles/${vehicle.id}/edit`}
          tone="accent"
          disabled={!canEdit || isArchived}
          disabledReason={isArchived ? t("vehicles.archivedEditHint") : t("permissions.managerRequired")}
        />
        <VehicleAction
          label={t("common.transfer")}
          to={`/vehicles/${vehicle.id}?tab=overview&panel=transfer#transfer-panel`}
          disabled={!canTransfer || isArchived}
          disabledReason={isArchived ? t("vehicles.archivedTransferHint") : t("permissions.adminRequired")}
        />
        <VehicleAction
          label={exportingId === vehicle.id ? t("pdf.exporting") : t("pdf.export")}
          onClick={() => handleExport(vehicle.id)}
          loading={exportingId === vehicle.id}
        />
        {isArchived ? (
          <VehicleAction
            label={t("common.restore")}
            onClick={() => void handleRestore(vehicle)}
            tone="accent"
            disabled={!canEdit}
            disabledReason={t("permissions.managerRequired")}
          />
        ) : (
          <VehicleAction
            label={t("common.archive")}
            onClick={() => void handleArchive(vehicle)}
            tone="danger"
            disabled={!canEdit}
            disabledReason={t("permissions.managerRequired")}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="shell-kicker">{t("vehicles.kicker")}</p>
            <h1 className="shell-title mt-3">{t("vehicles.title")}</h1>
            <p className="shell-subtitle">{t("vehicles.subtitle")}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="shell-muted flex items-center gap-2 px-2 py-2">
              <button
                type="button"
                aria-pressed={viewMode === "table"}
                onClick={() => handleViewModeChange("table")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  viewMode === "table" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
                }`}
              >
                {t("vehicles.view.table")}
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "cards"}
                onClick={() => handleViewModeChange("cards")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  viewMode === "cards" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
                }`}
              >
                {t("vehicles.view.cards")}
              </button>
            </div>

            <button
              type="button"
              disabled={!canEdit}
              title={!canEdit ? t("permissions.managerRequired") : undefined}
              onClick={() => navigate("/new")}
              className="app-btn-primary"
            >
              {t("dashboard.addVehicle")}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
        <div className="shell-panel p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <div>
              <p className="shell-kicker">{t("vehicles.filtersKicker")}</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("vehicles.filtersTitle")}</h2>
              <p className="mt-2 text-sm text-slate-500">{t("vehicles.filtersSubtitle")}</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-5">
              <label htmlFor="vehicle-search" className="block">
                <span className="sr-only">{t("vehicles.searchPlaceholder")}</span>
                <input
                  id="vehicle-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("vehicles.searchPlaceholder")}
                  className="field-input"
                />
              </label>

              <label htmlFor="vehicle-status-filter" className="block">
                <span className="sr-only">{t("dashboard.allStatuses")}</span>
                <select
                  id="vehicle-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="field-input"
                >
                  <option value="">{t("dashboard.allStatuses")}</option>
                  {VEHICLE_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {t(`status.${status}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label htmlFor="vehicle-archived-filter" className="block">
                <span className="sr-only">{t("vehicles.archiveScopeLabel")}</span>
                <select
                  id="vehicle-archived-filter"
                  value={archivedView}
                  onChange={(event) => setArchivedView(event.target.value as ArchivedView)}
                  className="field-input"
                >
                  <option value="active">{t("vehicles.archiveViews.active")}</option>
                  <option value="archived">{t("vehicles.archiveViews.archived")}</option>
                  <option value="all">{t("vehicles.archiveViews.all")}</option>
                </select>
              </label>

              <label htmlFor="vehicle-company-filter" className="block">
                <span className="sr-only">{t("dashboard.allCompanies")}</span>
                <select
                  id="vehicle-company-filter"
                  value={companyFilter}
                  onChange={(event) => setCompanyFilter(event.target.value)}
                  disabled={!canSeeCompanies}
                  title={!canSeeCompanies ? t("permissions.adminRequired") : undefined}
                  className="field-input disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value="">{t("dashboard.allCompanies")}</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>

              <label htmlFor="vehicle-page-size" className="block">
                <span className="sr-only">{t("dashboard.pagination.pageLabel", { page: pagination.page, totalPages: pagination.totalPages })}</span>
                <select
                  id="vehicle-page-size"
                  value={String(pageSize)}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="field-input"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {t("dashboard.pagination.pageSize", { count: option })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="shell-panel p-5 sm:p-6">
          <p className="shell-kicker">{t("vehicles.permissionsKicker")}</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("vehicles.permissionsTitle")}</h2>
          <p className="mt-2 text-sm text-slate-500">{t(`permissions.roleSummary.${user?.role ?? "VIEWER"}`)}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <StatusBadge label={roleLabel} tone="blue" />
            <span className="app-chip">{rangeLabel}</span>
          </div>

          <div className="mt-5 shell-muted p-4">
            <p className="text-sm font-semibold text-slate-900">{t("dashboard.import.title")}</p>
            <p className="mt-2 text-sm text-slate-500">{t("dashboard.import.subtitle")}</p>
            <div className="mt-4 flex flex-col gap-3">
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={!canEdit}
                aria-label={t("dashboard.import.title")}
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                className="field-input disabled:cursor-not-allowed disabled:bg-slate-100"
              />
              <button
                type="button"
                disabled={!canEdit}
                title={!canEdit ? t("permissions.managerRequired") : undefined}
                onClick={handleImport}
                className="app-btn-secondary"
              >
                {t("dashboard.import.action")}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="shell-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="shell-kicker">{t("vehicles.registryKicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("dashboard.table.title")}</h2>
            <p className="mt-2 text-sm text-slate-500">{rangeLabel}</p>
          </div>
          <div className="app-chip">{t("dashboard.pagination.pageLabel", { page: pagination.page, totalPages: pagination.totalPages })}</div>
        </div>

        {loading ? (
          <div className="p-5">
            {viewMode === "table" ? (
              <div className="overflow-hidden rounded-[24px] border border-slate-200">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="grid grid-cols-[64px_minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_minmax(280px,1fr)] gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0">
                    <SkeletonBlock className="h-14 w-14 rounded-2xl" />
                    <div>
                      <SkeletonBlock className="h-4 w-40" />
                      <SkeletonBlock className="mt-2 h-3 w-24" />
                    </div>
                    <SkeletonBlock className="h-4 w-24" />
                    <SkeletonBlock className="h-4 w-28" />
                    <SkeletonBlock className="h-6 w-24 rounded-full" />
                    <SkeletonBlock className="h-10 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <LoadingCard key={index} label={t("dashboard.loadingVehicles")} />
                ))}
              </div>
            )}
          </div>
        ) : vehicles.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={archivedView === "archived" ? t("vehicles.emptyArchivedTitle") : t("dashboard.table.emptyTitle")}
              description={archivedView === "archived" ? t("vehicles.emptyArchivedDescription") : t("dashboard.table.emptyDescription")}
              action={
                <button
                  type="button"
                  disabled={!canEdit}
                  title={!canEdit ? t("permissions.managerRequired") : undefined}
                  onClick={() => navigate("/new")}
                  className="app-btn-primary"
                >
                  {t("dashboard.addVehicle")}
                </button>
              }
            />
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50/70">
                <tr className="border-b border-slate-200/80">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.table.image")}</th>
                  {[ 
                    { key: "model", label: t("dashboard.table.model") },
                    { key: "plate", label: t("dashboard.table.plate") },
                    { key: "company", label: t("dashboard.table.company") },
                    { key: "status", label: t("dashboard.table.status") },
                    { key: "mileage", label: t("dashboard.table.mileage") },
                  ].map((column) => (
                    <th
                      key={column.key}
                      aria-sort={sortField === column.key ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                      className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-400"
                    >
                      <button
                        type="button"
                        aria-label={column.label}
                        onClick={() => handleSort(column.key)}
                        className="inline-flex items-center gap-2"
                      >
                        <span>{column.label}</span>
                        {sortField === column.key ? <span>{sortOrder === "asc" ? "^" : "v"}</span> : null}
                      </button>
                    </th>
                  ))}
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t("dashboard.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr
                    key={vehicle.id}
                    className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 ${vehicle.archivedAt || vehicle.deletedAt ? "bg-slate-50/80" : ""}`}
                  >
                    <td className="px-5 py-4">
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
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-slate-900">{vehicle.model}</p>
                      <p className="mt-1 text-xs text-slate-500">{t("vehicle.vin")} {vehicle.vin}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {vehicle.archivedAt || vehicle.deletedAt ? <StatusBadge label={t("vehicles.archivedBadge")} tone="slate" /> : null}
                        <StatusBadge label={t(`damageStatus.${vehicle.damageStatus}`)} tone={getDamageTone(vehicle.damageStatus)} />
                        {vehicle.hadPreviousAccidents ? (
                          <StatusBadge label={t("vehicle.accidentHistory")} tone="yellow" />
                        ) : null}
                      </div>
                      {vehicle.archiveReason ? <p className="mt-2 text-xs text-slate-500">{vehicle.archiveReason}</p> : null}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{vehicle.plate}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{vehicle.company?.name ?? "-"}</td>
                    <td className="px-5 py-4"><StatusBadge status={vehicle.status} /></td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {t("units.kilometers", { value: formatNumber(vehicle.mileage) })}
                    </td>
                    <td className="px-5 py-4">{renderActions(vehicle)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-5 p-5 md:grid-cols-2 2xl:grid-cols-3">
            {vehicles.map((vehicle) => (
              <article key={vehicle.id} className="shell-muted overflow-hidden">
                <div className="relative h-48 bg-slate-100">
                  {vehicle.imageUrl ? (
                    <img
                      src={resolveAssetUrl(vehicle.imageUrl)}
                      alt={vehicle.model}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-slate-300">
                      {vehicle.model.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute left-4 top-4">
                    <StatusBadge status={vehicle.status} />
                  </div>
                  <div className="absolute right-4 top-4">
                    <StatusBadge label={t(`damageStatus.${vehicle.damageStatus}`)} tone={getDamageTone(vehicle.damageStatus)} />
                  </div>
                  {vehicle.archivedAt || vehicle.deletedAt ? (
                    <div className="absolute bottom-4 left-4">
                      <StatusBadge label={t("vehicles.archivedBadge")} tone="slate" />
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{vehicle.model}</p>
                    <p className="mt-1 text-sm text-slate-500">{vehicle.plate}</p>
                    {vehicle.archiveReason ? <p className="mt-2 text-xs text-slate-500">{vehicle.archiveReason}</p> : null}
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
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.incidentCount")}</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{vehicle.incidentCount ?? 0}</p>
                    </div>
                  </div>

                  {renderActions(vehicle)}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">{rangeLabel}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!pagination.hasPreviousPage}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="app-btn-secondary"
            >
              {t("dashboard.pagination.previous")}
            </button>
            <button
              type="button"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((current) => current + 1)}
              className="app-btn-primary"
            >
              {t("dashboard.pagination.next")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default VehiclesPage;
