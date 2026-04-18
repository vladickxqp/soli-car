import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchAdminLogs } from "../../api";
import EmptyState from "../../components/EmptyState";
import LoadingCard from "../../components/LoadingCard";
import StatusBadge from "../../components/StatusBadge";
import { getErrorMessage } from "../../errors";
import { formatDateTime } from "../../formatters";
import { useAuthStore } from "../../store";
import { PaginationMeta, SystemEntityType, SystemLogEntry } from "../../types";

const ENTITY_TYPES: SystemEntityType[] = [
  "VEHICLE",
  "USER",
  "COMPANY",
  "TICKET",
  "INVITATION",
  "DOCUMENT",
  "MAINTENANCE",
  "APPROVAL",
];

const defaultPagination: PaginationMeta = {
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

const entityTone: Record<SystemEntityType, "blue" | "purple" | "green" | "yellow"> = {
  VEHICLE: "blue",
  USER: "purple",
  COMPANY: "green",
  TICKET: "yellow",
  INVITATION: "yellow",
  DOCUMENT: "blue",
  MAINTENANCE: "green",
  APPROVAL: "purple",
};

const formatMetadata = (value: unknown) => {
  if (!value) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const AdminLogsPage = () => {
  const token = useAuthStore((state) => state.token);
  const { t } = useTranslation();

  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta>(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setPagination((current) => ({ ...current, page: 1 }));
  }, [actionFilter, entityFilter, search]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchAdminLogs(token, {
      search,
      action: actionFilter || undefined,
      entityType: entityFilter || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }

        setLogs(response.items);
        setPagination(response.pagination);
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
  }, [actionFilter, entityFilter, pagination.page, pagination.pageSize, search, t, token]);

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <p className="shell-kicker">{t("admin.logs.kicker")}</p>
        <h1 className="shell-title mt-3">{t("admin.logs.title")}</h1>
        <p className="shell-subtitle">{t("admin.logs.subtitle")}</p>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="shell-panel p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px_220px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.logs.searchPlaceholder")}
            className="field-input"
          />
          <input
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            placeholder={t("admin.logs.actionPlaceholder")}
            className="field-input"
          />
          <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)} className="field-input">
            <option value="">{t("admin.logs.allEntities")}</option>
            {ENTITY_TYPES.map((entityType) => (
              <option key={entityType} value={entityType}>
                {t(`admin.logs.entity.${entityType}`)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="shell-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
          <div>
            <p className="shell-kicker">{t("admin.logs.listKicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("admin.logs.listTitle")}</h2>
          </div>
          <span className="app-chip">{pagination.total}</span>
        </div>

        {loading ? (
          <div className="p-5">
            <LoadingCard label={t("common.loading")} />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("admin.logs.emptyTitle")} description={t("admin.logs.emptyDescription")} />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => (
              <article key={log.id} className="space-y-4 px-5 py-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-semibold text-slate-950">{log.action}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {log.user?.email ?? t("admin.logs.systemActor")} / {formatDateTime(log.timestamp)}
                    </p>
                    {log.entityId ? <p className="mt-2 break-all text-xs text-slate-400">{log.entityId}</p> : null}
                  </div>
                  <StatusBadge label={t(`admin.logs.entity.${log.entityType}`)} tone={entityTone[log.entityType]} />
                </div>

                {log.metadata ? (
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("admin.logs.metadataTitle")}</p>
                    <pre className="mt-3 text-sm leading-6 text-slate-700">{formatMetadata(log.metadata)}</pre>
                  </div>
                ) : null}
              </article>
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
      </section>
    </div>
  );
};

export default AdminLogsPage;
