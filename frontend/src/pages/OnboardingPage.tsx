import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { completeOnboarding } from "../api";
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

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [language, setLanguage] = useState(i18n.resolvedLanguage ?? "en");
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredThemePreference());
  const [vehicleView, setVehicleView] = useState<VehicleViewPreference>(() => getStoredVehicleViewPreference());
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    if (!token || !user) {
      return;
    }

    setLoading(true);
    try {
      await i18n.changeLanguage(language);
      setStoredThemePreference(theme);
      setStoredVehicleViewPreference(vehicleView);
      const result = await completeOnboarding(token, {
        preferredLanguage: language,
        preferredTheme: theme,
        preferredVehicleView: vehicleView,
      });
      updateUser(result.user);
      toast.success(t("onboarding.success"));
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.16),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-4 py-10">
      <div className="w-full max-w-5xl rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_34px_100px_-54px_rgba(15,23,42,0.45)] sm:p-10">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-600">{t("onboarding.kicker")}</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">{t("onboarding.title")}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">{t("onboarding.subtitle")}</p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="shell-muted p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{t("onboarding.trust.email")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{user?.email}</p>
                <p className="mt-2 text-xs text-emerald-700">{t("onboarding.trust.emailVerified")}</p>
              </div>
              <div className="shell-muted p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{t("onboarding.trust.company")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{user?.companyName || "-"}</p>
                <p className="mt-2 text-xs text-slate-500">{t("auth.registrationType." + (user?.registrationType ?? "COMPANY"))}</p>
              </div>
              <div className="shell-muted p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{t("onboarding.trust.role")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{user?.role ? t(`roles.${user.role}`) : "-"}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {user?.isPlatformAdmin ? t("settings.profile.platformAdmin") : t("onboarding.trust.workspaceAccess")}
                </p>
              </div>
            </div>
          </div>

          <div className="shell-panel p-6 sm:p-7">
            <p className="shell-kicker">{t("onboarding.preferences.kicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("onboarding.preferences.title")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("onboarding.preferences.subtitle")}</p>

            <div className="mt-6 space-y-5">
              <label htmlFor="onboarding-language" className="block text-sm font-medium text-slate-700">
                {t("settings.language.title")}
                <select
                  id="onboarding-language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="field-input mt-2"
                >
                  <option value="en">{t("language.en")}</option>
                  <option value="de">{t("language.de")}</option>
                  <option value="ru">{t("language.ru")}</option>
                </select>
              </label>

              <div>
                <p className="text-sm font-medium text-slate-700">{t("settings.theme.title")}</p>
                <div className="mt-2 app-segmented flex items-center gap-2 p-2">
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    aria-pressed={theme === "light"}
                    className={`app-segment ${theme === "light" ? "app-segment-active" : "app-segment-inactive"}`}
                  >
                    {t("settings.theme.light")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    aria-pressed={theme === "dark"}
                    className={`app-segment ${theme === "dark" ? "app-segment-active" : "app-segment-inactive"}`}
                  >
                    {t("settings.theme.dark")}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700">{t("settings.preferences.title")}</p>
                <div className="mt-2 app-segmented flex items-center gap-2 p-2">
                  <button
                    type="button"
                    onClick={() => setVehicleView("table")}
                    aria-pressed={vehicleView === "table"}
                    className={`app-segment ${vehicleView === "table" ? "app-segment-active" : "app-segment-inactive"}`}
                  >
                    {t("vehicles.view.table")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVehicleView("cards")}
                    aria-pressed={vehicleView === "cards"}
                    className={`app-segment ${vehicleView === "cards" ? "app-segment-active" : "app-segment-inactive"}`}
                  >
                    {t("vehicles.view.cards")}
                  </button>
                </div>
              </div>

              <button type="button" disabled={loading} onClick={handleComplete} className="app-btn-primary w-full justify-center">
                {loading ? t("common.loading") : t("onboarding.completeAction")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
