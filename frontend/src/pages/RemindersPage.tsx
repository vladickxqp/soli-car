import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchCompanies, fetchReminders } from "../api";
import EmptyState from "../components/EmptyState";
import LoadingCard from "../components/LoadingCard";
import StatusBadge from "../components/StatusBadge";
import { getErrorMessage } from "../errors";
import { formatDate } from "../formatters";
import { canSelectCompanyScope } from "../permissions";
import { useAuthStore } from "../store";
import { Company, ReminderItem, ReminderState, ReminderType } from "../types";

const REMINDER_TYPES: ReminderType[] = ["TUV", "INSURANCE", "CONTRACT", "MAINTENANCE", "DOCUMENT"];
const REMINDER_STATES: ReminderState[] = ["UPCOMING", "DUE", "OVERDUE"];

const getStateTone = (state: ReminderState): "green" | "yellow" | "red" =>
  state === "OVERDUE" ? "red" : state === "DUE" ? "yellow" : "green";

const RemindersPage = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canSelectCompany = canSelectCompanyScope(user);

  useEffect(() => {
    if (!token || !canSelectCompany) {
      return;
    }

    fetchCompanies(token)
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, [canSelectCompany, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchReminders(token, {
      companyId: canSelectCompany ? companyFilter || undefined : undefined,
      type: typeFilter || undefined,
      state: stateFilter || undefined,
    })
      .then((data) => {
        if (!cancelled) {
          setReminders(data);
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
  }, [canSelectCompany, companyFilter, stateFilter, t, token, typeFilter]);

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <p className="shell-kicker">{t("reminders.kicker")}</p>
        <h1 className="shell-title mt-3">{t("reminders.title")}</h1>
        <p className="shell-subtitle">{t("reminders.subtitle")}</p>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="shell-panel p-5 sm:p-6">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          {canSelectCompany ? (
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className="field-input">
              <option value="">{t("dashboard.allCompanies")}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          ) : null}

          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="field-input">
            <option value="">{t("reminders.allTypes")}</option>
            {REMINDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`notifications.types.${type}`)}
              </option>
            ))}
          </select>

          <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} className="field-input">
            <option value="">{t("reminders.allStates")}</option>
            {REMINDER_STATES.map((state) => (
              <option key={state} value={state}>
                {t(`reminders.state.${state}`)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="shell-panel p-5 sm:p-6">
        {loading ? (
          <LoadingCard label={t("common.loading")} />
        ) : reminders.length === 0 ? (
          <EmptyState title={t("reminders.emptyTitle")} description={t("reminders.emptyDescription")} />
        ) : (
          <div className="space-y-4">
            {reminders.map((reminder) => (
              <article key={reminder.id} className="shell-muted px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-950">{reminder.title}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      {reminder.vehicle.model} / {reminder.vehicle.plate} / {reminder.vehicle.companyName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={t(`notifications.types.${reminder.type}`)} tone="blue" />
                    <StatusBadge label={t(`reminders.state.${reminder.state}`)} tone={getStateTone(reminder.state)} />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
                  <span>{t("notifications.dueDate", { date: formatDate(reminder.dueDate) })}</span>
                  <span>
                    {reminder.state === "OVERDUE"
                      ? t("notifications.expired", { count: Math.abs(reminder.daysRemaining) })
                      : reminder.daysRemaining === 1
                        ? t("notifications.dayLeft")
                        : t("notifications.daysLeft", { count: reminder.daysRemaining })}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default RemindersPage;
