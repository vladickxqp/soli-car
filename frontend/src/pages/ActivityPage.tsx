import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchActivity, fetchCompanies } from "../api";
import ActivityFeedList from "../components/ActivityFeedList";
import LoadingCard from "../components/LoadingCard";
import { getErrorMessage } from "../errors";
import { canSelectCompanyScope } from "../permissions";
import { useAuthStore } from "../store";
import { ActivityFeedItem, Company, PaginationMeta, SystemEntityType } from "../types";

const ENTITY_TYPES: SystemEntityType[] = [
  "VEHICLE",
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

const ActivityPage = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta>(defaultPagination);
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
    setPagination((current) => ({ ...current, page: 1 }));
  }, [companyFilter, dateFrom, dateTo, entityFilter, search]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchActivity(token, {
      companyId: companyFilter || undefined,
      entityType: entityFilter || undefined,
      search: search.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }

        setItems(response.items);
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
  }, [companyFilter, dateFrom, dateTo, entityFilter, pagination.page, pagination.pageSize, search, t, token]);

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6 sm:p-7">
        <p className="shell-kicker">{t("activity.kicker")}</p>
        <h1 className="shell-title mt-3">{t("activity.pageTitle")}</h1>
        <p className="shell-subtitle">{t("activity.pageSubtitle")}</p>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="shell-panel p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("activity.searchPlaceholder")}
            className="field-input xl:col-span-2"
          />

          <select
            value={entityFilter}
            onChange={(event) => setEntityFilter(event.target.value)}
            className="field-input"
          >
            <option value="">{t("activity.allEntities")}</option>
            {ENTITY_TYPES.map((entityType) => (
              <option key={entityType} value={entityType}>
                {t(`admin.logs.entity.${entityType}`)}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="field-input"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="field-input"
          />

          {canSeeCompanies ? (
            <select
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="field-input xl:col-span-2"
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

      <section className="shell-panel p-5 sm:p-6">
        {loading ? (
          <div className="space-y-3">
            <LoadingCard label={t("activity.loading")} />
            <LoadingCard label={t("activity.loading")} />
            <LoadingCard label={t("activity.loading")} />
          </div>
        ) : (
          <ActivityFeedList
            items={items}
            emptyTitle={t("activity.emptyTitle")}
            emptyDescription={t("activity.emptyDescription")}
          />
        )}
      </section>

      <section className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={!pagination.hasPreviousPage}
          onClick={() => setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
          className="app-btn-secondary"
        >
          {t("dashboard.pagination.previous")}
        </button>
        <p className="text-sm text-slate-500">
          {t("dashboard.pagination.pageLabel", { page: pagination.page, totalPages: pagination.totalPages })}
        </p>
        <button
          type="button"
          disabled={!pagination.hasNextPage}
          onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
          className="app-btn-primary"
        >
          {t("dashboard.pagination.next")}
        </button>
      </section>
    </div>
  );
};

export default ActivityPage;
