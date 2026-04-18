import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { logoutSession } from "../api";
import { useAuthStore } from "../store";
import StatusBadge from "./StatusBadge";

const adminNavItems = [
  { key: "users", path: "/admin/users" },
  { key: "companies", path: "/admin/companies" },
  { key: "vehicles", path: "/admin/vehicles" },
  { key: "tickets", path: "/admin/tickets" },
  { key: "approvals", path: "/admin/approvals" },
  { key: "logs", path: "/admin/logs" },
];

const AdminLayout = () => {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const roleLabel = user?.role ? t(`roles.${user.role}`) : t("common.loading");

  const handleLogout = async () => {
    try {
      if (token) {
        await logoutSession(token);
      }
    } catch {
      // Keep local logout reliable even if the session revoke request fails.
    } finally {
      logout();
      toast.success(t("auth.loggedOut"));
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen xl:grid xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-r border-slate-200 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98)_0%,_rgba(15,118,110,0.95)_100%)] px-5 py-6 text-white">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-200">{t("admin.shell.kicker")}</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("admin.shell.title")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-200">{t("admin.shell.subtitle")}</p>
        </div>

        <nav className="mt-8 space-y-2">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              className={({ isActive }) =>
                `flex rounded-[22px] px-4 py-3 text-sm font-semibold transition ${
                  isActive ? "bg-white text-slate-950 shadow-lg" : "text-slate-100 hover:bg-white/10"
                }`
              }
            >
              {t(`admin.nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>

        <div className="mt-8 rounded-[24px] border border-white/10 bg-white/10 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-100">{t("admin.shell.session")}</p>
          <p className="mt-3 text-sm font-semibold text-white">{user?.email}</p>
          <p className="mt-1 text-xs text-slate-200">{user?.companyName}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge label={roleLabel} tone="blue" />
            <StatusBadge
              label={user?.emailVerifiedAt ? t("settings.profile.emailVerified") : t("settings.profile.emailPending")}
              tone={user?.emailVerifiedAt ? "green" : "yellow"}
            />
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={() => navigate("/")} className="app-btn-secondary justify-center">
              {t("admin.shell.backToApp")}
            </button>
            <button type="button" onClick={handleLogout} className="app-btn-danger justify-center">
              {t("nav.logout")}
            </button>
          </div>
        </div>
      </aside>

      <main className="px-4 py-6 sm:px-6 xl:px-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
