import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  fetchTicketAttachmentBlob,
  fetchAdminTicket,
  fetchAdminTickets,
  fetchCompanies,
  replyToAdminTicket,
  updateAdminTicket,
} from "../../api";
import EmptyState from "../../components/EmptyState";
import LoadingCard from "../../components/LoadingCard";
import StatusBadge from "../../components/StatusBadge";
import { getErrorMessage } from "../../errors";
import { formatDateTime } from "../../formatters";
import { useAuthStore } from "../../store";
import { Company, PaginationMeta, SupportTicket, TicketPriority, TicketStatus } from "../../types";
import { getTicketPriorityTone, getTicketStatusTone } from "../../utils/ticketPresentation";

const TICKET_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "CLOSED"];
const TICKET_PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH"];

const defaultPagination: PaginationMeta = {
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

const AdminTicketsPage = () => {
  const token = useAuthStore((state) => state.token);
  const { t } = useTranslation();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusValue, setStatusValue] = useState<TicketStatus>("OPEN");
  const [priorityValue, setPriorityValue] = useState<TicketPriority>("MEDIUM");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta>(defaultPagination);
  const [replyMessage, setReplyMessage] = useState("");
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }

    fetchCompanies(token)
      .then(setCompanies)
      .catch((loadError) => setError(getErrorMessage(loadError, t)));
  }, [t, token]);

  useEffect(() => {
    if (!selectedTicket) {
      return;
    }

    setStatusValue(selectedTicket.status);
    setPriorityValue(selectedTicket.priority);
  }, [selectedTicket]);

  useEffect(() => {
    setPagination((current) => ({ ...current, page: 1 }));
  }, [companyFilter, priorityFilter, search, statusFilter]);

  const loadTicketDetail = async (ticketId: string) => {
    if (!token) {
      return;
    }

    const detail = await fetchAdminTicket(token, ticketId);
    setSelectedTicket(detail);
    setSelectedTicketId(detail.id);
    setStatusValue(detail.status);
    setPriorityValue(detail.priority);
  };

  const refreshTickets = async (preferredTicketId?: string | null) => {
    if (!token) {
      return;
    }

    const response = await fetchAdminTickets(token, {
      search,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      companyId: companyFilter || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    setTickets(response.items);
    setPagination(response.pagination);

    const nextTicketId =
      preferredTicketId && response.items.some((ticket) => ticket.id === preferredTicketId)
        ? preferredTicketId
        : response.items[0]?.id ?? null;

    if (!nextTicketId) {
      setSelectedTicket(null);
      setSelectedTicketId(null);
      return;
    }

    await loadTicketDetail(nextTicketId);
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchAdminTickets(token, {
      search,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      companyId: companyFilter || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        setTickets(response.items);
        setPagination(response.pagination);
        setError("");

        const nextTicketId =
          selectedTicketId && response.items.some((ticket) => ticket.id === selectedTicketId)
            ? selectedTicketId
            : response.items[0]?.id ?? null;

        if (!nextTicketId) {
          setSelectedTicket(null);
          setSelectedTicketId(null);
          return;
        }

        const detail = await fetchAdminTicket(token, nextTicketId);
        if (!cancelled) {
          setSelectedTicket(detail);
          setSelectedTicketId(detail.id);
          setStatusValue(detail.status);
          setPriorityValue(detail.priority);
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
  }, [companyFilter, pagination.page, pagination.pageSize, priorityFilter, search, statusFilter, t, token]);

  const handleReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedTicket) {
      return;
    }

    setReplying(true);
    try {
      const updatedTicket = await replyToAdminTicket(token, selectedTicket.id, {
        message: replyMessage,
        attachment: replyAttachment,
      });
      toast.success(t("admin.tickets.replySent"));
      setReplyMessage("");
      setReplyAttachment(null);
      setSelectedTicket(updatedTicket);
      setSelectedTicketId(updatedTicket.id);
      setTickets((current) => current.map((ticket) => (ticket.id === updatedTicket.id ? updatedTicket : ticket)));
      await refreshTickets(updatedTicket.id);
    } catch (replyError) {
      toast.error(getErrorMessage(replyError, t));
    } finally {
      setReplying(false);
    }
  };

  const handleUpdateTicket = async () => {
    if (!token || !selectedTicket) {
      return;
    }

    setUpdating(true);
    try {
      const updatedTicket = await updateAdminTicket(token, selectedTicket.id, {
        status: statusValue,
        priority: priorityValue,
      });
      toast.success(t("admin.tickets.updated"));
      setSelectedTicket(updatedTicket);
      setSelectedTicketId(updatedTicket.id);
      setTickets((current) => current.map((ticket) => (ticket.id === updatedTicket.id ? updatedTicket : ticket)));
      await refreshTickets(updatedTicket.id);
    } catch (updateError) {
      toast.error(getErrorMessage(updateError, t));
    } finally {
      setUpdating(false);
    }
  };

  const openAttachment = async (messageId: string) => {
    if (!token) {
      return;
    }

    try {
      const blob = await fetchTicketAttachmentBlob(token, messageId);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (attachmentError) {
      toast.error(getErrorMessage(attachmentError, t));
    }
  };

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <p className="shell-kicker">{t("admin.tickets.kicker")}</p>
        <h1 className="shell-title mt-3">{t("admin.tickets.title")}</h1>
        <p className="shell-subtitle">{t("admin.tickets.subtitle")}</p>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <div className="grid gap-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("admin.tickets.searchPlaceholder")}
                className="field-input"
              />
              <div className="grid gap-3 md:grid-cols-3">
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="field-input">
                  <option value="">{t("support.filters.allStatuses")}</option>
                  {TICKET_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(`support.status.${status}`)}
                    </option>
                  ))}
                </select>
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="field-input">
                  <option value="">{t("support.filters.allPriorities")}</option>
                  {TICKET_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {t(`support.priority.${priority}`)}
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
            </div>
          </article>

          <article className="shell-panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
              <div>
                <p className="shell-kicker">{t("admin.tickets.listKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("admin.tickets.listTitle")}</h2>
              </div>
              <span className="app-chip">{pagination.total}</span>
            </div>

            {loading ? (
              <div className="p-5">
                <LoadingCard label={t("common.loading")} />
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-5">
                <EmptyState title={t("admin.tickets.emptyTitle")} description={t("admin.tickets.emptyDescription")} />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      loadTicketDetail(ticket.id).catch((detailError) => {
                        toast.error(getErrorMessage(detailError, t));
                      });
                    }}
                    className={`w-full px-5 py-4 text-left transition hover:bg-slate-50 ${
                      selectedTicket?.id === ticket.id ? "bg-slate-50/90" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">#{ticket.id.slice(0, 8)}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {ticket.company.name} / {ticket.user?.email ?? t("support.deletedUser")}
                        </p>
                      </div>
                      <StatusBadge label={t(`support.status.${ticket.status}`)} tone={getTicketStatusTone(ticket.status)} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge label={t(`support.priority.${ticket.priority}`)} tone={getTicketPriorityTone(ticket.priority)} />
                      <span className="app-chip">{t(`support.categories.${ticket.category}`)}</span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                      {ticket.messages[ticket.messages.length - 1]?.message ?? t("admin.tickets.noMessages")}
                    </p>
                    <p className="mt-3 text-xs text-slate-400">{formatDateTime(ticket.updatedAt)}</p>
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
          {!selectedTicket ? (
            <EmptyState title={t("admin.tickets.threadEmptyTitle")} description={t("admin.tickets.threadEmptyDescription")} />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="shell-kicker">{t("admin.tickets.threadKicker")}</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">#{selectedTicket.id}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {selectedTicket.company.name} / {selectedTicket.user?.email ?? t("support.deletedUser")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={t(`support.status.${selectedTicket.status}`)} tone={getTicketStatusTone(selectedTicket.status)} />
                  <StatusBadge label={t(`support.priority.${selectedTicket.priority}`)} tone={getTicketPriorityTone(selectedTicket.priority)} />
                  <span className="app-chip">{t(`support.categories.${selectedTicket.category}`)}</span>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="shell-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.company")}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{selectedTicket.company.name}</p>
                </div>
                <div className="shell-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("auth.email")}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{selectedTicket.user?.email ?? t("support.deletedUser")}</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-950">{t("admin.tickets.controlsTitle")}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <select value={statusValue} onChange={(event) => setStatusValue(event.target.value as TicketStatus)} className="field-input">
                    {TICKET_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`support.status.${status}`)}
                      </option>
                    ))}
                  </select>
                  <select value={priorityValue} onChange={(event) => setPriorityValue(event.target.value as TicketPriority)} className="field-input">
                    {TICKET_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {t(`support.priority.${priority}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={handleUpdateTicket} disabled={updating} className="app-btn-secondary mt-4">
                  {updating ? t("common.loading") : t("admin.tickets.updateAction")}
                </button>
              </div>

              <div className="space-y-4">
                {selectedTicket.messages.map((message) => {
                  const isAdminMessage = message.sender?.role === "ADMIN";

                  return (
                    <div key={message.id} className={`flex ${isAdminMessage ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[88%] rounded-[24px] px-4 py-4 ${isAdminMessage ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`}>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                          <span>{message.sender?.email ?? t("support.deletedUser")}</span>
                          {message.sender?.role ? (
                            <span className={isAdminMessage ? "text-slate-300" : "text-slate-400"}>
                              {t(`roles.${message.sender.role}`)}
                            </span>
                          ) : null}
                        </div>
                        <p className={`mt-3 whitespace-pre-wrap text-sm leading-6 ${isAdminMessage ? "text-white" : "text-slate-700"}`}>{message.message}</p>
                        {message.attachmentUrl ? (
                          <button
                            type="button"
                            onClick={() => void openAttachment(message.id)}
                            className={`mt-3 inline-flex text-sm font-semibold ${isAdminMessage ? "text-teal-200" : "text-sky-700"}`}
                          >
                            {t("support.viewAttachment")}
                          </button>
                        ) : null}
                        <p className={`mt-3 text-xs ${isAdminMessage ? "text-slate-300" : "text-slate-400"}`}>{formatDateTime(message.timestamp)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form className="space-y-4 border-t border-slate-200 pt-5" onSubmit={handleReply}>
                <label className="block text-sm font-medium text-slate-700">
                  {t("support.reply")}
                  <textarea
                    value={replyMessage}
                    onChange={(event) => setReplyMessage(event.target.value)}
                    rows={4}
                    className="field-input mt-2 resize-y"
                    required
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  {t("support.attachment")}
                  <input
                    type="file"
                    onChange={(event) => setReplyAttachment(event.target.files?.[0] ?? null)}
                    className="field-input mt-2"
                  />
                </label>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">{t("admin.tickets.replyHint")}</p>
                  <button type="submit" disabled={replying} className="app-btn-primary">
                    {replying ? t("common.loading") : t("support.sendReply")}
                  </button>
                </div>
              </form>
            </div>
          )}
        </article>
      </section>
    </div>
  );
};

export default AdminTicketsPage;
