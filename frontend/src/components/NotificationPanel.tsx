import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardNotification } from "../types";
import { formatDate } from "../formatters";
import EmptyState from "./EmptyState";
import StatusBadge from "./StatusBadge";

interface NotificationPanelProps {
  notifications: DashboardNotification[];
}

const severityTone = {
  green: "green",
  yellow: "yellow",
  red: "red",
} as const;

const NotificationPanel = ({ notifications }: NotificationPanelProps) => {
  const { t } = useTranslation();

  if (notifications.length === 0) {
    return (
      <EmptyState
        title={t("notifications.emptyTitle")}
        description={t("notifications.emptyDescription")}
      />
    );
  }

  return (
    <div className="shell-panel p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="shell-kicker">{t("notifications.kicker")}</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">{t("notifications.title")}</h3>
          <p className="mt-1 text-sm text-slate-500">{t("notifications.subtitle")}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {notifications.map((notification) => (
          <Link
            key={notification.id}
            to={`/vehicles/${notification.vehicle.id}`}
            className="flex flex-col gap-3 rounded-[24px] border border-slate-200/80 bg-slate-50/80 px-4 py-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
          >
            <div
              className={`h-1 w-16 rounded-full ${
                notification.severity === "red"
                  ? "bg-rose-400"
                  : notification.severity === "yellow"
                    ? "bg-amber-400"
                    : "bg-emerald-400"
              }`}
            ></div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={t(`notifications.types.${notification.type}`)} tone={severityTone[notification.severity]} />
              <StatusBadge status={notification.vehicle.status} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {notification.vehicle.model} / {notification.vehicle.plate}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {notification.vehicle.companyName} / {t("notifications.dueDate", { date: formatDate(notification.dueDate) })}
              </div>
            </div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              {t(
                notification.daysRemaining <= 0
                  ? "notifications.expired"
                  : notification.daysRemaining === 1
                    ? "notifications.dayLeft"
                    : "notifications.daysLeft",
                { count: Math.abs(notification.daysRemaining) },
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default NotificationPanel;
