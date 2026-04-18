import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  fetchCompanies,
  resetAdminUserPassword,
  updateAdminUser,
} from "../../api";
import EmptyState from "../../components/EmptyState";
import LoadingCard from "../../components/LoadingCard";
import StatusBadge from "../../components/StatusBadge";
import { getErrorMessage } from "../../errors";
import { formatDateTime } from "../../formatters";
import { useAuthStore } from "../../store";
import { AdminUser, Company, PaginationMeta, UserRole } from "../../types";

const USER_ROLE_OPTIONS: UserRole[] = ["ADMIN", "MANAGER", "VIEWER"];

const defaultPagination: PaginationMeta = {
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

const initialForm = {
  email: "",
  password: "",
  role: "VIEWER" as UserRole,
  companyId: "",
  isPlatformAdmin: false,
};

const isApprovalResponse = (value: unknown): value is { action: "approval_requested"; approval: { id: string } } =>
  Boolean(
    value &&
    typeof value === "object" &&
    "action" in value &&
    (value as { action?: string }).action === "approval_requested",
  );

const AdminUsersPage = () => {
  const token = useAuthStore((state) => state.token);
  const { t } = useTranslation();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState(initialForm);
  const [passwordResetValue, setPasswordResetValue] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta>(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchAdminUsers(token, {
      search,
      role: roleFilter || undefined,
      companyId: companyFilter || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setUsers(result.items);
        setPagination(result.pagination);
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
  }, [companyFilter, pagination.page, pagination.pageSize, roleFilter, search, t, token]);

  const refreshUsers = async () => {
    if (!token) {
      return;
    }

    const result = await fetchAdminUsers(token, {
      search,
      role: roleFilter || undefined,
      companyId: companyFilter || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    setUsers(result.items);
    setPagination(result.pagination);
  };

  const handleSelectUser = (user: AdminUser) => {
    setSelectedUser(user);
    setForm({
      email: user.email,
      password: "",
      role: user.role,
      companyId: user.companyId,
      isPlatformAdmin: Boolean(user.isPlatformAdmin),
    });
    setPasswordResetValue("");
  };

  const handleStartCreate = () => {
    setSelectedUser(null);
    setForm(initialForm);
    setPasswordResetValue("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setSaving(true);
    try {
      if (selectedUser) {
        const updatedUser = await updateAdminUser(token, selectedUser.id, {
          email: form.email,
          role: form.role,
          companyId: form.companyId,
          isPlatformAdmin: form.isPlatformAdmin,
        });
        if (isApprovalResponse(updatedUser)) {
          toast.success(t("admin.approvals.requestCreated"));
        } else {
          toast.success(t("admin.users.updated"));
          setSelectedUser(updatedUser);
          setForm({
            email: updatedUser.email,
            password: "",
            role: updatedUser.role,
            companyId: updatedUser.companyId,
            isPlatformAdmin: Boolean(updatedUser.isPlatformAdmin),
          });
        }
      } else {
        const createdUser = await createAdminUser(token, form);
        if (isApprovalResponse(createdUser)) {
          toast.success(t("admin.approvals.requestCreated"));
        } else {
          toast.success(t("admin.users.created"));
          setSelectedUser(createdUser);
          setForm({
            email: createdUser.email,
            password: "",
            role: createdUser.role,
            companyId: createdUser.companyId,
            isPlatformAdmin: Boolean(createdUser.isPlatformAdmin),
          });
        }
      }

      await refreshUsers();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, t));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!token) {
      return;
    }

    if (!window.confirm(t("admin.users.deleteConfirm", { email: user.email }))) {
      return;
    }

    try {
      const result = await deleteAdminUser(token, user.id);
      if (isApprovalResponse(result)) {
        toast.success(t("admin.approvals.requestCreated"));
      } else {
        toast.success(t("admin.users.deleted"));
        if (selectedUser?.id === user.id) {
          handleStartCreate();
        }
      }
      await refreshUsers();
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, t));
    }
  };

  const handlePasswordReset = async () => {
    if (!token || !selectedUser) {
      return;
    }

    try {
      const result = await resetAdminUserPassword(token, selectedUser.id, passwordResetValue);
      if (isApprovalResponse(result)) {
        toast.success(t("admin.approvals.requestCreated"));
      } else {
        toast.success(t("admin.users.passwordResetSuccess"));
        setPasswordResetValue("");
      }
    } catch (resetError) {
      toast.error(getErrorMessage(resetError, t));
    }
  };

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="shell-kicker">{t("admin.users.kicker")}</p>
            <h1 className="shell-title mt-3">{t("admin.users.title")}</h1>
            <p className="shell-subtitle">{t("admin.users.subtitle")}</p>
          </div>
          <button type="button" onClick={handleStartCreate} className="app-btn-primary">
            {t("admin.users.createAction")}
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_420px]">
        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPagination((current) => ({ ...current, page: 1 }));
                }}
                placeholder={t("admin.users.searchPlaceholder")}
                className="field-input"
              />
              <select
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value);
                  setPagination((current) => ({ ...current, page: 1 }));
                }}
                className="field-input"
              >
                <option value="">{t("admin.filters.allRoles")}</option>
                {USER_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {t(`roles.${role}`)}
                  </option>
                ))}
              </select>
              <select
                value={companyFilter}
                onChange={(event) => {
                  setCompanyFilter(event.target.value);
                  setPagination((current) => ({ ...current, page: 1 }));
                }}
                className="field-input"
              >
                <option value="">{t("dashboard.allCompanies")}</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          </article>

          <article className="shell-panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
              <div>
                <p className="shell-kicker">{t("admin.users.listKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("admin.users.listTitle")}</h2>
              </div>
              <span className="app-chip">{pagination.total}</span>
            </div>

            {loading ? (
              <div className="p-5">
                <LoadingCard label={t("common.loading")} />
              </div>
            ) : users.length === 0 ? (
              <div className="p-5">
                <EmptyState title={t("admin.users.emptyTitle")} description={t("admin.users.emptyDescription")} />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {users.map((user) => (
                  <div key={user.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <button type="button" onClick={() => handleSelectUser(user)} className="min-w-0 text-left">
                      <p className="truncate text-sm font-semibold text-slate-950">{user.email}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {user.company.name} / {formatDateTime(user.createdAt)}
                      </p>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={t(`roles.${user.role}`)} tone="blue" />
                      {user.isPlatformAdmin ? <StatusBadge label={t("admin.users.platformAdmin")} tone="red" /> : null}
                      <button type="button" onClick={() => handleSelectUser(user)} className="app-btn-secondary">
                        {t("common.edit")}
                      </button>
                      <button type="button" onClick={() => handleDelete(user)} className="app-btn-danger">
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <p className="text-sm text-slate-500">{t("dashboard.pagination.pageLabel", { page: pagination.page, totalPages: pagination.totalPages })}</p>
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

        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{selectedUser ? t("admin.users.editKicker") : t("admin.users.createKicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              {selectedUser ? t("admin.users.editTitle") : t("admin.users.createTitle")}
            </h2>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-slate-700">
                {t("auth.email")}
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="field-input mt-2"
                  required
                />
              </label>

              {!selectedUser ? (
                <label className="block text-sm font-medium text-slate-700">
                  {t("auth.password")}
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    className="field-input mt-2"
                    required
                  />
                </label>
              ) : null}

              <label className="block text-sm font-medium text-slate-700">
                {t("settings.profile.role")}
                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => {
                      const nextRole = event.target.value as UserRole;
                      return {
                        ...current,
                        role: nextRole,
                        isPlatformAdmin: nextRole === "ADMIN" ? current.isPlatformAdmin : false,
                      };
                    })
                  }
                  className="field-input mt-2"
                >
                  {USER_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {t(`roles.${role}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                {t("vehicle.company")}
                <select
                  value={form.companyId}
                  onChange={(event) => setForm((current) => ({ ...current, companyId: event.target.value }))}
                  className="field-input mt-2"
                  required
                >
                  <option value="">{t("form.selectCompany")}</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isPlatformAdmin}
                  onChange={(event) => setForm((current) => ({ ...current, isPlatformAdmin: event.target.checked }))}
                  disabled={form.role !== "ADMIN"}
                  className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-300"
                />
                <span>{t("admin.users.platformAdminToggle")}</span>
              </label>

              <button type="submit" disabled={saving} className="app-btn-primary w-full">
                {saving ? t("common.loading") : selectedUser ? t("form.saveChanges") : t("admin.users.createAction")}
              </button>
            </form>
          </article>

          {selectedUser ? (
            <article className="shell-panel p-5 sm:p-6">
              <p className="shell-kicker">{t("admin.users.passwordResetKicker")}</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("admin.users.passwordResetTitle")}</h2>
              <p className="mt-2 text-sm text-slate-500">{selectedUser.email}</p>

              <label className="mt-5 block text-sm font-medium text-slate-700">
                {t("auth.password")}
                <input
                  type="password"
                  value={passwordResetValue}
                  onChange={(event) => setPasswordResetValue(event.target.value)}
                  className="field-input mt-2"
                />
              </label>

              <button
                type="button"
                disabled={!passwordResetValue}
                onClick={handlePasswordReset}
                className="app-btn-secondary mt-4 w-full"
              >
                {t("admin.users.resetPasswordAction")}
              </button>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default AdminUsersPage;
