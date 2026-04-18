import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppNotification } from "../types";
import { formatDateTime, formatRelativeTime } from "../formatters";
import EmptyState from "./EmptyState";
import StatusBadge from "./StatusBadge";

interface NotificationCenterPanelProps {
  notifications: AppNotification[];
  unreadCount: number;
  loading?: boolean;
  onMarkRead: (notificationId: string) => void;
  onArchive: (notificationId: string) => void;
  onMarkAllRead: () => void;
  embedded?: boolean;
}

const priorityTone = {
  LOW: "blue",
  MEDIUM: "yellow",
  HIGH: "red",
} as const;

const NotificationCenterPanel = ({
  notifications,
  unreadCount,
  loading = false,
  onMarkRead,
  onArchive,
  onMarkAllRead,
  embedded = false,
}: NotificationCenterPanelProps) => {
  const { t } = useTranslation();

  return (
    <div className={`${embedded ? "shell-panel overflow-hidden" : "app-popover w-[380px] overflow-hidden rounded-[26px]"}`}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">{t("notificationsCenter.title")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("notificationsCenter.subtitle", { count: unreadCount })}</p>
        </div>
        <button type="button" onClick={onMarkAllRead} className="text-xs font-semibold text-sky-700 transition hover:text-sky-800">
          {t("notificationsCenter.markAllRead")}
        </button>
      </div>

      <div className="max-h-[480px] overflow-y-auto p-3">
        {loading ? (
          <div className="px-2 py-8 text-sm text-slate-500">{t("common.loading")}</div>
        ) : notifications.length === 0 ? (
          <EmptyState
            title={t("notificationsCenter.emptyTitle")}
            description={t("notificationsCenter.emptyDescription")}
          />
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div key={notification.id} className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        label={t(`notificationsCenter.types.${notification.type}`, notification.type)}
                        tone={priorityTone[notification.priority]}
                      />
                      {notification.status === "UNREAD" ? (
                        <StatusBadge label={t("notificationsCenter.unread")} tone="purple" />
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-950">{notification.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(notification.createdAt)}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {notification.link ? (
                    <Link to={notification.link} className="app-btn-secondary !px-3 !py-2 !text-xs">
                      {t("common.view")}
                    </Link>
                  ) : null}
                  {notification.status === "UNREAD" ? (
                    <button type="button" onClick={() => onMarkRead(notification.id)} className="app-btn-secondary !px-3 !py-2 !text-xs">
                      {t("notificationsCenter.markRead")}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => onArchive(notification.id)} className="app-btn-ghost !px-3 !py-2 !text-xs">
                    {t("notificationsCenter.archive")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!embedded ? (
        <div className="border-t border-slate-200 px-4 py-4">
          <Link to="/notifications" className="app-btn-primary w-full justify-center">
            {t("notificationsCenter.openAll")}
          </Link>
        </div>
      ) : null}
    </div>
  );
};

export default NotificationCenterPanel;
