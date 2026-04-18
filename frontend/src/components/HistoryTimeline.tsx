import { useTranslation } from "react-i18next";
import { VehicleHistory } from "../types";
import { formatDateTime } from "../formatters";
import { getHistoryChangeRows, getHistoryEntrySummary } from "../utils/historyPresentation";
import EmptyState from "./EmptyState";

interface HistoryTimelineProps {
  history: VehicleHistory[];
}

const HistoryTimeline = ({ history }: HistoryTimelineProps) => {
  const { t } = useTranslation();

  if (history.length === 0) {
    return (
      <EmptyState
        title={t("history.emptyTitle")}
        description={t("history.emptyDescription")}
      />
    );
  }

  return (
    <div className="relative pl-3">
      <div className="absolute bottom-0 left-[18px] top-2 w-px bg-slate-200"></div>
      <div className="space-y-5">
        {history.map((entry) => {
          const changeRows = getHistoryChangeRows(entry, t);
          const summary = getHistoryEntrySummary(entry, t);

          return (
            <div key={entry.id} className="relative flex gap-4">
              <div className="relative z-10 mt-2 h-4 w-4 rounded-full border-4 border-white bg-slate-900 shadow"></div>
              <div className="flex-1 rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {t(`history.actions.${entry.actionType}`)}
                    </p>
                    <h4 className="mt-1 text-sm font-semibold text-slate-900">{entry.changedBy.email}</h4>
                  </div>
                  <p className="text-sm text-slate-500">{formatDateTime(entry.timestamp)}</p>
                </div>

                <p className="mt-3 text-sm text-slate-600">
                  {Array.isArray(summary) ? summary.join(" | ") : summary}
                </p>

                {changeRows.length > 0 ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="hidden grid-cols-[minmax(120px,1fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-200 bg-slate-100/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 sm:grid">
                      <div>{t("history.field")}</div>
                      <div>{t("history.previous")}</div>
                      <div>{t("history.current")}</div>
                    </div>
                    {changeRows.map((row) => (
                      <div
                        key={row.key}
                        className="grid gap-3 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0 sm:grid-cols-[minmax(120px,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4 sm:py-3"
                      >
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:hidden">
                            {t("history.field")}
                          </p>
                          <div className="font-medium text-slate-900">{row.label}</div>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:hidden">
                            {t("history.previous")}
                          </p>
                          <div className="text-slate-500">{row.previous}</div>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:hidden">
                            {t("history.current")}
                          </p>
                          <div className="text-slate-700">{row.current}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    {t("history.noFieldDiff")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HistoryTimeline;
