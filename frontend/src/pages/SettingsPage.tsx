import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { changeOwnPassword, fetchSessions, logoutSession, resendVerificationEmail, revokeSession } from "../api";
import StatusBadge from "../components/StatusBadge";
import { getErrorMessage } from "../errors";
import {
  ThemePreference,
  VehicleViewPreference,
  getStoredThemePreference,
  getStoredVehicleViewPreference,
  setStoredThemePreference,
  setStoredVehicleViewPreference,
} from "../preferences";
import { useAuthStore } from "../store";
import { UserSessionRecord } from "../types";

const SettingsPage = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [theme, setTheme] = useState<ThemePreference>(() => getStoredThemePreference());
  const [viewMode, setViewMode] = useState<VehicleViewPreference>(() => getStoredVehicleViewPreference());
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [sessions, setSessions] = useState<UserSessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);

  const roleLabel = user?.role ? t(`roles.${user.role}`) : t("common.loading");

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setSessionsLoading(true);

    fetchSessions(token)
      .then((data) => {
        if (!cancelled) {
          setSessions(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSessionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleLanguageChange = async (value: string) => {
    await i18n.changeLanguage(value);
    toast.success(t("settings.saved"));
  };

  const handleViewModeChange = (value: VehicleViewPreference) => {
    setStoredVehicleViewPreference(value);
    setViewMode(value);
    toast.success(t("settings.saved"));
  };

  const handleThemeChange = (value: ThemePreference) => {
    setStoredThemePreference(value);
    setTheme(value);
    toast.success(t("settings.saved"));
  };

  const handlePasswordChange = async (event: FormEvent) => {
    event.preventDefault();

    if (!token) {
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t("settings.security.passwordMismatch"));
      return;
    }

    setPasswordLoading(true);
    try {
      await changeOwnPassword(token, {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t("settings.security.passwordChanged"));
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!user?.email) {
      return;
    }

    setVerificationLoading(true);
    try {
      await resendVerificationEmail({ email: user.email });
      toast.success(t("auth.verify.resent"));
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleSessionRevoke = async (sessionId: string) => {
    if (!token) {
      return;
    }

    try {
      const result = await revokeSession(token, sessionId);
      setSessions((current) => current.filter((session) => session.id !== sessionId));

      if (result.currentSessionRevoked) {
        logout();
        toast.success(t("settings.session.currentRevoked"));
        navigate("/login");
        return;
      }

      toast.success(t("settings.session.revoked"));
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    }
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await logoutSession(token);
      }
    } catch {
      // We still clear the local session to keep logout reliable.
    } finally {
      logout();
      toast.success(t("auth.loggedOut"));
      navigate("/login");
    }
  };

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <p className="shell-kicker">{t("settings.kicker")}</p>
        <h1 className="shell-title mt-3">{t("settings.title")}</h1>
        <p className="shell-subtitle">{t("settings.subtitle")}</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("settings.language.kicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("settings.language.title")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("settings.language.subtitle")}</p>

            <label htmlFor="settings-language" className="mt-5 block text-sm font-medium text-slate-700">
              {t("settings.language.title")}
              <select
                id="settings-language"
                value={i18n.resolvedLanguage ?? "en"}
                onChange={(event) => handleLanguageChange(event.target.value)}
                className="field-input mt-2 max-w-sm"
              >
                <option value="en">{t("language.en")}</option>
                <option value="de">{t("language.de")}</option>
                <option value="ru">{t("language.ru")}</option>
              </select>
            </label>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("settings.theme.kicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("settings.theme.title")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("settings.theme.subtitle")}</p>

            <div className="mt-5 app-segmented flex items-center gap-2 p-2" role="group" aria-label={t("settings.theme.title")}>
              <button
                type="button"
                aria-pressed={theme === "light"}
                onClick={() => handleThemeChange("light")}
                className={`app-segment ${theme === "light" ? "app-segment-active" : "app-segment-inactive"}`}
              >
                {t("settings.theme.light")}
              </button>
              <button
                type="button"
                aria-pressed={theme === "dark"}
                onClick={() => handleThemeChange("dark")}
                className={`app-segment ${theme === "dark" ? "app-segment-active" : "app-segment-inactive"}`}
              >
                {t("settings.theme.dark")}
              </button>
            </div>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("settings.preferences.kicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("settings.preferences.title")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("settings.preferences.subtitle")}</p>

            <div className="mt-5 app-segmented flex items-center gap-2 p-2" role="group" aria-label={t("settings.preferences.title")}>
              <button
                type="button"
                aria-pressed={viewMode === "table"}
                onClick={() => handleViewModeChange("table")}
                className={`app-segment ${viewMode === "table" ? "app-segment-active" : "app-segment-inactive"}`}
              >
                {t("vehicles.view.table")}
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "cards"}
                onClick={() => handleViewModeChange("cards")}
                className={`app-segment ${viewMode === "cards" ? "app-segment-active" : "app-segment-inactive"}`}
              >
                {t("vehicles.view.cards")}
              </button>
            </div>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("settings.support.kicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("settings.support.title")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("settings.support.subtitle")}</p>

            <button type="button" onClick={() => navigate("/support")} className="app-btn-secondary mt-5">
              {t("settings.support.action")}
            </button>
          </article>
        </div>

        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("settings.profile.kicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("settings.profile.title")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("settings.profile.subtitle")}</p>

            <div className="mt-5 grid gap-4">
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("settings.profile.email")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{user?.email}</p>
                <div className="mt-3">
                  <StatusBadge
                    label={user?.emailVerifiedAt ? t("settings.profile.emailVerified") : t("settings.profile.emailPending")}
                    tone={user?.emailVerifiedAt ? "green" : "yellow"}
                  />
                </div>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("settings.profile.role")}</p>
                <div className="mt-2">
                  <StatusBadge label={roleLabel} tone="blue" />
                  {user?.isPlatformAdmin ? (
                    <div className="mt-2">
                      <StatusBadge label={t("settings.profile.platformAdmin")} tone="red" />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("settings.profile.company")}</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{user?.companyName || "-"}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("settings.profile.registrationType")}</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{t(`auth.registrationType.${user?.registrationType ?? "COMPANY"}`)}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("settings.profile.companyId")}</p>
                <p className="mt-2 break-all text-sm font-medium text-slate-900">{user?.companyId || "-"}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("settings.profile.onboarding")}</p>
                <div className="mt-2">
                  <StatusBadge
                    label={user?.onboardingCompletedAt ? t("settings.profile.onboardingDone") : t("settings.profile.onboardingPending")}
                    tone={user?.onboardingCompletedAt ? "green" : "yellow"}
                  />
                </div>
              </div>
            </div>

            {!user?.emailVerifiedAt ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-sm font-semibold text-amber-900">{t("settings.profile.verificationNoticeTitle")}</p>
                <p className="mt-2 text-sm text-amber-800">{t("settings.profile.verificationNoticeBody")}</p>
                <button
                  type="button"
                  disabled={verificationLoading}
                  onClick={handleResendVerification}
                  className="app-btn-secondary mt-4"
                >
                  {verificationLoading ? t("common.loading") : t("auth.verify.resendAction")}
                </button>
              </div>
            ) : null}
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("settings.security.kicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("settings.security.title")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("settings.security.subtitle")}</p>

            <form className="mt-5 space-y-4" onSubmit={handlePasswordChange}>
              <label htmlFor="current-password" className="block text-sm font-medium text-slate-700">
                {t("auth.currentPassword")}
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="field-input mt-2"
                  required
                />
              </label>

              <label htmlFor="new-password" className="block text-sm font-medium text-slate-700">
                {t("auth.newPassword")}
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="field-input mt-2"
                  minLength={8}
                  required
                />
              </label>

              <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">
                {t("auth.confirmPassword")}
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="field-input mt-2"
                  minLength={8}
                  required
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">{t("settings.security.passwordHint")}</p>
                <button type="submit" disabled={passwordLoading} className="app-btn-secondary">
                  {passwordLoading ? t("common.loading") : t("settings.security.changePasswordAction")}
                </button>
              </div>
            </form>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("settings.session.kicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("settings.session.title")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("settings.session.subtitle")}</p>

            <div className="mt-5 space-y-3">
              {sessionsLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">{t("common.loading")}</div>
              ) : sessions.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">{t("settings.session.empty")}</div>
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="shell-muted flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {session.isCurrent ? t("settings.session.currentSession") : t("settings.session.otherSession")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{session.userAgent || t("settings.session.unknownAgent")}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {(session.ipAddress || t("settings.session.unknownIp"))} · {new Date(session.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button type="button" onClick={() => handleSessionRevoke(session.id)} className="app-btn-secondary">
                      {session.isCurrent ? t("settings.session.revokeCurrent") : t("settings.session.revoke")}
                    </button>
                  </div>
                ))
              )}
            </div>

            <button type="button" onClick={handleLogout} className="app-btn-danger mt-5">
              {t("nav.logout")}
            </button>
          </article>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
