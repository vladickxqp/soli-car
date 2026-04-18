import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  archiveNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api";
import EmptyState from "../components/EmptyState";
import LoadingCard from "../components/LoadingCard";
import NotificationCenterPanel from "../components/NotificationCenterPanel";
import { getErrorMessage } from "../errors";
import { useAuthStore } from "../store";
import { AppNotification, NotificationPriority, NotificationStatus, NotificationType, PaginationMeta } from "../types";

const NotificationsPage = () => {
  const token = useAuthStore((state) => state.token);
  const { t } = useTranslation();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<"" | NotificationStatus>("");
  const [type, setType] = useState<"" | NotificationType>("");
  const [priority, setPriority] = useState<"" | NotificationPriority>("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetchNotifications(token, {
        status: status || undefined,
        type: type || undefined,
        priority: priority || undefined,
        page,
        pageSize: 12,
      });
      setItems(response.items);
      setUnreadCount(response.unreadCount);
      setPagination(response.pagination);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, t));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, priority, status, t, token, type]);

  const handleMarkRead = async (notificationId: string) => {
    if (!token) return;
    try {
      await markNotificationRead(token, notificationId);
      await load();
    } catch (actionError) {
      toast.error(getErrorMessage(actionError, t));
    }
  };

  const handleArchive = async (notificationId: string) => {
    if (!token) return;
    try {
      await archiveNotification(token, notificationId);
      toast.success(t("notificationsCenter.archived"));
      await load();
    } catch (actionError) {
      toast.error(getErrorMessage(actionError, t));
    }
  };

  const handleMarkAllRead = async () => {
    if (!token) return;
    try {
      await markAllNotificationsRead(token);
      toast.success(t("notificationsCenter.readAllDone"));
      await load();
    } catch (actionError) {
      toast.error(getErrorMessage(actionError, t));
    }
  };

  useEffect(() => {
    setPage(1);
  }, [priority, status, type]);

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6 sm:p-7">
        <p className="shell-kicker">{t("notificationsCenter.kicker")}</p>
        <h1 className="shell-title mt-3">{t("notificationsCenter.pageTitle")}</h1>
        <p className="shell-subtitle">{t("notificationsCenter.pageSubtitle")}</p>
      </section>

      <section className="shell-panel p-5 sm:p-6">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <select value={status} onChange={(event) => setStatus(event.target.value as "" | NotificationStatus)} className="field-input">
            <option value="">{t("notificationsCenter.allStatuses")}</option>
            <option value="UNREAD">{t("notificationsCenter.unread")}</option>
            <option value="READ">{t("notificationsCenter.read")}</option>
            <option value="ARCHIVED">{t("notificationsCenter.archivedLabel")}</option>
          </select>

          <select value={type} onChange={(event) => setType(event.target.value as "" | NotificationType)} className="field-input">
            <option value="">{t("notificationsCenter.allTypes")}</option>
            {(["INVITATION", "SUPPORT", "REMINDER", "APPROVAL", "VEHICLE", "INCIDENT", "MAINTENANCE", "DOCUMENT", "SYSTEM"] as NotificationType[]).map((value) => (
              <option key={value} value={value}>
                {t(`notificationsCenter.types.${value}`)}
              </option>
            ))}
          </select>

          <select value={priority} onChange={(event) => setPriority(event.target.value as "" | NotificationPriority)} className="field-input">
            <option value="">{t("notificationsCenter.allPriorities")}</option>
            {(["LOW", "MEDIUM", "HIGH"] as NotificationPriority[]).map((value) => (
              <option key={value} value={value}>
                {t(`notificationsCenter.priority.${value}`)}
              </option>
            ))}
          </select>

          <button type="button" onClick={() => void handleMarkAllRead()} className="app-btn-secondary">
            {t("notificationsCenter.markAllRead")}
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <LoadingCard label={t("common.loading")} />
      ) : items.length === 0 ? (
        <section className="shell-panel p-6">
          <EmptyState title={t("notificationsCenter.emptyTitle")} description={t("notificationsCenter.emptyDescription")} />
        </section>
      ) : (
        <NotificationCenterPanel
          notifications={items}
          unreadCount={unreadCount}
          embedded
          onMarkRead={(id) => void handleMarkRead(id)}
          onArchive={(id) => void handleArchive(id)}
          onMarkAllRead={() => void handleMarkAllRead()}
        />
      )}

      <section className="flex items-center justify-between">
        <button type="button" disabled={!pagination.hasPreviousPage} onClick={() => setPage((current) => Math.max(1, current - 1))} className="app-btn-secondary">
          {t("dashboard.pagination.previous")}
        </button>
        <p className="text-sm text-slate-500">
          {t("dashboard.pagination.pageLabel", { page: pagination.page, totalPages: pagination.totalPages })}
        </p>
        <button type="button" disabled={!pagination.hasNextPage} onClick={() => setPage((current) => current + 1)} className="app-btn-primary">
          {t("dashboard.pagination.next")}
        </button>
      </section>
    </div>
  );
};

export default NotificationsPage;
