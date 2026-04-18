import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  approveAdminApproval,
  fetchAdminApprovals,
  fetchCompanies,
  rejectAdminApproval,
} from "../../api";
import EmptyState from "../../components/EmptyState";
import LoadingCard from "../../components/LoadingCard";
import StatusBadge from "../../components/StatusBadge";
import { getErrorMessage } from "../../errors";
import { formatDateTime } from "../../formatters";
import { useAuthStore } from "../../store";
import { ApprovalAction, ApprovalRequest, ApprovalStatus, Company, PaginationMeta } from "../../types";

const APPROVAL_STATUSES: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED"];
const APPROVAL_ACTIONS: ApprovalAction[] = [
  "ADMIN_USER_CREATE",
  "ADMIN_USER_UPDATE",
  "ADMIN_USER_DELETE",
  "ADMIN_USER_PASSWORD_RESET",
  "ADMIN_COMPANY_DELETE",
  "ADMIN_VEHICLE_TRANSFER",
  "ADMIN_VEHICLE_DELETE",
];

const defaultPagination: PaginationMeta = {
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

const getStatusTone = (status: ApprovalStatus): "yellow" | "green" | "red" =>
  status === "PENDING" ? "yellow" : status === "APPROVED" ? "green" : "red";

const AdminApprovalsPage = () => {
  const token = useAuthStore((state) => state.token);
  const { t } = useTranslation();

  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta>(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPagination((current) => ({ ...current, page: 1 }));
  }, [actionFilter, companyFilter, search, statusFilter]);

  useEffect(() => {
    if (!token) {
      return;
    }

    fetchCompanies(token)
      .then(setCompanies)
      .catch((loadError) => setError(getErrorMessage(loadError, t)));
  }, [t, token]);

  const refreshApprovals = async (preferredId?: string | null) => {
    if (!token) {
      return;
    }

    const result = await fetchAdminApprovals(token, {
      search,
      status: statusFilter || undefined,
      action: actionFilter || undefined,
      companyId: companyFilter || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    setApprovals(result.items);
    setPagination(result.pagination);
    setSelectedApproval((current) => {
      const nextId = preferredId ?? current?.id;
      return nextId ? result.items.find((item) => item.id === nextId) ?? result.items[0] ?? null : result.items[0] ?? null;
    });
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchAdminApprovals(token, {
      search,
      status: statusFilter || undefined,
      action: actionFilter || undefined,
      companyId: companyFilter || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setApprovals(result.items);
        setPagination(result.pagination);
        setSelectedApproval((current) => current ? result.items.find((item) => item.id === current.id) ?? result.items[0] ?? null : result.items[0] ?? null);
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
  }, [actionFilter, companyFilter, pagination.page, pagination.pageSize, search, statusFilter, t, token]);

  const handleDecision = async (decision: "approve" | "reject") => {
    if (!token || !selectedApproval) {
      return;
    }

    setSubmitting(true);
    try {
      const updated = decision === "approve"
        ? await approveAdminApproval(token, selectedApproval.id, reviewComment || undefined)
        : await rejectAdminApproval(token, selectedApproval.id, reviewComment || undefined);

      toast.success(
        decision === "approve" ? t("admin.approvals.approved") : t("admin.approvals.rejected"),
      );
      setReviewComment("");
      setSelectedApproval(updated);
      await refreshApprovals(updated.id);
    } catch (decisionError) {
      toast.error(getErrorMessage(decisionError, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <p className="shell-kicker">{t("admin.approvals.kicker")}</p>
        <h1 className="shell-title mt-3">{t("admin.approvals.title")}</h1>
        <p className="shell-subtitle">{t("admin.approvals.subtitle")}</p>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <div className="grid gap-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("admin.approvals.searchPlaceholder")}
                className="field-input"
              />
              <div className="grid gap-3 md:grid-cols-3">
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="field-input">
                  <option value="">{t("admin.approvals.allStatuses")}</option>
                  {APPROVAL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(`admin.approvals.status.${status}`)}
                    </option>
                  ))}
                </select>
                <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="field-input">
                  <option value="">{t("admin.approvals.allActions")}</option>
                  {APPROVAL_ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {t(`admin.approvals.actions.${action}`)}
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
                <p className="shell-kicker">{t("admin.approvals.listKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("admin.approvals.listTitle")}</h2>
              </div>
              <span className="app-chip">{pagination.total}</span>
            </div>

            {loading ? (
              <div className="p-5">
                <LoadingCard label={t("common.loading")} />
              </div>
            ) : approvals.length === 0 ? (
              <div className="p-5">
                <EmptyState title={t("admin.approvals.emptyTitle")} description={t("admin.approvals.emptyDescription")} />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {approvals.map((approval) => (
                  <button
                    key={approval.id}
                    type="button"
                    onClick={() => setSelectedApproval(approval)}
                    className={`w-full px-5 py-4 text-left transition hover:bg-slate-50 ${
                      selectedApproval?.id === approval.id ? "bg-slate-50/90" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {t(`admin.approvals.actions.${approval.action}`)}
                        </p>
                        <p className="mt-1 truncate text-sm text-slate-500">
                          {approval.requestedBy?.email ?? "-"} / {approval.company?.name ?? t("admin.approvals.platformScope")}
                        </p>
                      </div>
                      <StatusBadge label={t(`admin.approvals.status.${approval.status}`)} tone={getStatusTone(approval.status)} />
                    </div>
                    <p className="mt-3 text-xs text-slate-400">{formatDateTime(approval.createdAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </article>
        </div>

        <article className="shell-panel p-5 sm:p-6">
          {!selectedApproval ? (
            <EmptyState title={t("admin.approvals.detailEmptyTitle")} description={t("admin.approvals.detailEmptyDescription")} />
          ) : (
            <div className="space-y-5">
              <div>
                <p className="shell-kicker">{t("admin.approvals.detailKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t(`admin.approvals.actions.${selectedApproval.action}`)}</h2>
                <p className="mt-2 text-sm text-slate-500">{selectedApproval.requestedBy?.email ?? "-"} / {formatDateTime(selectedApproval.createdAt)}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="shell-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("admin.approvals.fields.status")}</p>
                  <div className="mt-2">
                    <StatusBadge label={t(`admin.approvals.status.${selectedApproval.status}`)} tone={getStatusTone(selectedApproval.status)} />
                  </div>
                </div>
                <div className="shell-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.company")}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{selectedApproval.company?.name ?? t("admin.approvals.platformScope")}</p>
                </div>
              </div>

              {selectedApproval.reason ? (
                <div className="shell-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("admin.approvals.fields.reason")}</p>
                  <p className="mt-2 text-sm text-slate-700">{selectedApproval.reason}</p>
                </div>
              ) : null}

              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("admin.approvals.fields.payload")}</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
                  {JSON.stringify(selectedApproval.payload ?? {}, null, 2)}
                </pre>
              </div>

              {selectedApproval.status === "PENDING" ? (
                <>
                  <label className="block text-sm font-medium text-slate-700">
                    {t("admin.approvals.reviewComment")}
                    <textarea
                      value={reviewComment}
                      onChange={(event) => setReviewComment(event.target.value)}
                      rows={4}
                      className="field-input mt-2 resize-y"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => void handleDecision("approve")} disabled={submitting} className="app-btn-primary">
                      {submitting ? t("common.loading") : t("admin.approvals.approveAction")}
                    </button>
                    <button type="button" onClick={() => void handleDecision("reject")} disabled={submitting} className="app-btn-danger">
                      {submitting ? t("common.loading") : t("admin.approvals.rejectAction")}
                    </button>
                  </div>
                </>
              ) : (
                <div className="shell-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("admin.approvals.fields.reviewedBy")}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{selectedApproval.reviewedBy?.email ?? "-"}</p>
                  <p className="mt-2 text-sm text-slate-500">{selectedApproval.reviewedAt ? formatDateTime(selectedApproval.reviewedAt) : "-"}</p>
                  {selectedApproval.reviewComment ? <p className="mt-3 text-sm text-slate-700">{selectedApproval.reviewComment}</p> : null}
                </div>
              )}
            </div>
          )}
        </article>
      </section>
    </div>
  );
};

export default AdminApprovalsPage;
