import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  createSupportTicket,
  fetchTicketAttachmentBlob,
  fetchVehicle,
  fetchVehicles,
  fetchSupportTicket,
  fetchSupportTickets,
  replyToSupportTicket,
} from "../api";
import EmptyState from "../components/EmptyState";
import LoadingCard from "../components/LoadingCard";
import StatusBadge from "../components/StatusBadge";
import { getErrorMessage } from "../errors";
import { formatDateTime } from "../formatters";
import { useAuthStore } from "../store";
import { SupportTicket, TicketCategory, Vehicle, VehicleListItem } from "../types";
import { getTicketPriorityTone, getTicketStatusTone } from "../utils/ticketPresentation";

const SUPPORT_CATEGORIES: TicketCategory[] = ["TECHNICAL", "BILLING", "OTHER"];

const SupportPage = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState("");
  const [createCategory, setCreateCategory] = useState<TicketCategory>("TECHNICAL");
  const [createMessage, setCreateMessage] = useState("");
  const [createAttachment, setCreateAttachment] = useState<File | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
  const [supportVehicles, setSupportVehicles] = useState<VehicleListItem[]>([]);
  const [incidentVehicle, setIncidentVehicle] = useState<Vehicle | null>(null);
  const [createVehicleId, setCreateVehicleId] = useState("");
  const [createVehicleIncidentId, setCreateVehicleIncidentId] = useState("");

  const selectedTicketId = searchParams.get("ticket");

  const loadTickets = async () => {
    if (!token) {
      return;
    }

    const list = await fetchSupportTickets(token);
    setTickets(list);

    const preferredId = selectedTicketId ?? list[0]?.id;
    if (preferredId) {
      try {
        const detail = await fetchSupportTicket(token, preferredId);
        setSelectedTicket(detail);
        setSearchParams({ ticket: detail.id }, { replace: true });
        return;
      } catch {
        if (list[0]?.id && list[0].id !== preferredId) {
          const fallbackDetail = await fetchSupportTicket(token, list[0].id);
          setSelectedTicket(fallbackDetail);
          setSearchParams({ ticket: fallbackDetail.id }, { replace: true });
          return;
        }
      }
    }

    setSelectedTicket(null);
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadTickets()
      .then(() => {
        if (!cancelled) {
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
  }, [selectedTicketId, setSearchParams, t, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    fetchVehicles(token, { page: 1, pageSize: 100 })
      .then((response) => setSupportVehicles(response.items))
      .catch(() => setSupportVehicles([]));
  }, [token]);

  useEffect(() => {
    if (!token || !createVehicleId) {
      setIncidentVehicle(null);
      setCreateVehicleIncidentId("");
      return;
    }

    fetchVehicle(token, createVehicleId)
      .then((vehicle) => setIncidentVehicle(vehicle))
      .catch(() => {
        setIncidentVehicle(null);
        setCreateVehicleIncidentId("");
      });
  }, [createVehicleId, token]);

  const ticketPreview = useMemo(
    () =>
      tickets.map((ticket) => ({
        ...ticket,
        lastMessage: ticket.messages[ticket.messages.length - 1]?.message ?? "",
      })),
    [tickets],
  );

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

  const handleCreateTicket = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setSubmitting(true);
    try {
      const createdTicket = await createSupportTicket(token, {
        category: createCategory,
        message: createMessage,
        attachment: createAttachment,
        vehicleId: createVehicleId || undefined,
        vehicleIncidentId: createVehicleIncidentId || undefined,
      });
      toast.success(t("support.ticketCreated"));
      setCreateMessage("");
      setCreateAttachment(null);
      setCreateVehicleId("");
      setCreateVehicleIncidentId("");
      setTickets((current) => [createdTicket, ...current]);
      setSelectedTicket(createdTicket);
      setSearchParams({ ticket: createdTicket.id }, { replace: true });
    } catch (createError) {
      toast.error(getErrorMessage(createError, t));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenTicket = async (ticketId: string) => {
    if (!token) {
      return;
    }

    try {
      const detail = await fetchSupportTicket(token, ticketId);
      setSelectedTicket(detail);
      setSearchParams({ ticket: ticketId }, { replace: true });
    } catch (detailError) {
      toast.error(getErrorMessage(detailError, t));
    }
  };

  const handleReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedTicket) {
      return;
    }

    setReplying(true);
    try {
      const updatedTicket = await replyToSupportTicket(token, selectedTicket.id, {
        message: replyMessage,
        attachment: replyAttachment,
      });
      toast.success(t("support.messageSent"));
      setReplyMessage("");
      setReplyAttachment(null);
      setSelectedTicket(updatedTicket);
      setTickets((current) => current.map((ticket) => (ticket.id === updatedTicket.id ? updatedTicket : ticket)));
    } catch (replyError) {
      toast.error(getErrorMessage(replyError, t));
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <p className="shell-kicker">{t("support.kicker")}</p>
        <h1 className="shell-title mt-3">{t("support.title")}</h1>
        <p className="shell-subtitle">{t("support.subtitle")}</p>
      </section>

      {error ? (
        <div aria-live="polite" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("support.newTicketKicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("support.newTicketTitle")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("support.newTicketSubtitle")}</p>

            <form className="mt-5 space-y-4" onSubmit={handleCreateTicket}>
              <label className="block text-sm font-medium text-slate-700">
                {t("support.category")}
                <select
                  value={createCategory}
                  onChange={(event) => setCreateCategory(event.target.value as TicketCategory)}
                  className="field-input mt-2"
                >
                  {SUPPORT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {t(`support.categories.${category}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                {t("support.message")}
                <textarea
                  value={createMessage}
                  onChange={(event) => setCreateMessage(event.target.value)}
                  rows={5}
                  minLength={3}
                  className="field-input mt-2 resize-y"
                  required
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                {t("support.relatedVehicle")}
                <select
                  value={createVehicleId}
                  onChange={(event) => setCreateVehicleId(event.target.value)}
                  className="field-input mt-2"
                >
                  <option value="">{t("support.noVehicleReference")}</option>
                  {supportVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.model} / {vehicle.plate}
                    </option>
                  ))}
                </select>
              </label>

              {incidentVehicle && incidentVehicle.incidents.length > 0 ? (
                <label className="block text-sm font-medium text-slate-700">
                  {t("support.relatedIncident")}
                  <select
                    value={createVehicleIncidentId}
                    onChange={(event) => setCreateVehicleIncidentId(event.target.value)}
                    className="field-input mt-2"
                  >
                    <option value="">{t("support.noIncidentReference")}</option>
                    {incidentVehicle.incidents.map((incident) => (
                      <option key={incident.id} value={incident.id}>
                        {incident.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block text-sm font-medium text-slate-700">
                {t("support.attachment")}
                <input
                  type="file"
                  onChange={(event) => setCreateAttachment(event.target.files?.[0] ?? null)}
                  className="field-input mt-2"
                />
              </label>

              <button type="submit" disabled={submitting} className="app-btn-primary w-full">
                {submitting ? t("common.loading") : t("support.createTicket")}
              </button>
            </form>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="shell-kicker">{t("support.ticketListKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("support.ticketListTitle")}</h2>
              </div>
              <span className="app-chip">{ticketPreview.length}</span>
            </div>

            {loading ? (
              <div className="mt-5">
                <LoadingCard label={t("support.loading")} />
              </div>
            ) : ticketPreview.length === 0 ? (
              <div className="mt-5">
                <EmptyState title={t("support.emptyTitle")} description={t("support.emptyDescription")} />
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {ticketPreview.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => handleOpenTicket(ticket.id)}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                      selectedTicket?.id === ticket.id
                        ? "border-slate-300 bg-slate-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">#{ticket.id.slice(0, 8)}</p>
                        <p className="mt-1 text-xs text-slate-500">{t(`support.categories.${ticket.category}`)}</p>
                      </div>
                      <StatusBadge label={t(`support.status.${ticket.status}`)} tone={getTicketStatusTone(ticket.status)} />
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600">{ticket.lastMessage}</p>
                    <p className="mt-3 text-xs text-slate-400">{formatDateTime(ticket.updatedAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </article>
        </div>

        <article className="shell-panel p-5 sm:p-6">
          {!selectedTicket ? (
            <EmptyState title={t("support.threadEmptyTitle")} description={t("support.threadEmptyDescription")} />
          ) : (
            <>
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="shell-kicker">{t("support.threadKicker")}</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">#{selectedTicket.id}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {t(`support.categories.${selectedTicket.category}`)} / {selectedTicket.company.name}
                  </p>
                  {selectedTicket.vehicle ? (
                    <p className="mt-2 text-sm text-slate-500">
                      {selectedTicket.vehicle.model} / {selectedTicket.vehicle.plate}
                      {selectedTicket.vehicleIncident ? ` • ${selectedTicket.vehicleIncident.title}` : ""}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={t(`support.status.${selectedTicket.status}`)} tone={getTicketStatusTone(selectedTicket.status)} />
                  <StatusBadge label={t(`support.priority.${selectedTicket.priority}`)} tone={getTicketPriorityTone(selectedTicket.priority)} />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {selectedTicket.messages.map((message) => {
                  const isOwn = message.sender?.id === user?.id;

                  return (
                    <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-[24px] px-4 py-4 ${isOwn ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`}>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                          <span>{isOwn ? t("support.you") : message.sender?.email ?? t("support.agent")}</span>
                          {message.sender?.role ? <span className={`${isOwn ? "text-slate-300" : "text-slate-400"}`}>{t(`roles.${message.sender.role}`)}</span> : null}
                        </div>
                        <p className={`mt-3 whitespace-pre-wrap text-sm leading-6 ${isOwn ? "text-white" : "text-slate-700"}`}>{message.message}</p>
                        {message.attachmentUrl ? (
                          <button
                            type="button"
                            onClick={() => void openAttachment(message.id)}
                            className={`mt-3 inline-flex text-sm font-semibold ${isOwn ? "text-teal-200" : "text-sky-700"}`}
                          >
                            {t("support.viewAttachment")}
                          </button>
                        ) : null}
                        <p className={`mt-3 text-xs ${isOwn ? "text-slate-300" : "text-slate-400"}`}>{formatDateTime(message.timestamp)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form className="mt-6 space-y-4 border-t border-slate-200 pt-5" onSubmit={handleReply}>
                <label className="block text-sm font-medium text-slate-700">
                  {t("support.reply")}
                  <textarea
                    value={replyMessage}
                    onChange={(event) => setReplyMessage(event.target.value)}
                    rows={4}
                    minLength={1}
                    className="field-input mt-2 resize-y"
                    disabled={selectedTicket.status === "CLOSED"}
                    required
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  {t("support.attachment")}
                  <input
                    type="file"
                    onChange={(event) => setReplyAttachment(event.target.files?.[0] ?? null)}
                    className="field-input mt-2"
                    disabled={selectedTicket.status === "CLOSED"}
                  />
                </label>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">
                    {selectedTicket.status === "CLOSED" ? t("support.closedHint") : t("support.replyHint")}
                  </p>
                  <button type="submit" disabled={replying || selectedTicket.status === "CLOSED"} className="app-btn-primary">
                    {replying ? t("common.loading") : t("support.sendReply")}
                  </button>
                </div>
              </form>
            </>
          )}
        </article>
      </section>
    </div>
  );
};

export default SupportPage;
