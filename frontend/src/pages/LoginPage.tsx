import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ApiError, authLogin, resendVerificationEmail } from "../api";
import { getErrorMessage } from "../errors";
import { useAuthStore } from "../store";

const LoginPage = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [resending, setResending] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const data = await authLogin({ email, password });
      setAuth(data.token, data.user);
      toast.success(t("auth.loginSuccess"));
      navigate("/");
    } catch (error) {
      if (error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED") {
        setPendingVerificationEmail(email);
      }
      toast.error(getErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingVerificationEmail) {
      return;
    }

    setResending(true);
    try {
      await resendVerificationEmail({ email: pendingVerificationEmail });
      toast.success(t("auth.verify.resent"));
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(13,148,136,0.18),_transparent_35%),linear-gradient(180deg,_#0f172a_0%,_#111827_100%)] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-teal-200">Soli Car</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t("auth.loginTitle")}</h1>
            <p className="mt-2 text-sm text-slate-300">{t("auth.loginSubtitle")}</p>
          </div>
          <select
            value={i18n.resolvedLanguage ?? "en"}
            onChange={(event) => i18n.changeLanguage(event.target.value)}
            aria-label={t("settings.language.title")}
            className="rounded-2xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white"
          >
            <option value="en">{t("language.en")}</option>
            <option value="de">{t("language.de")}</option>
            <option value="ru">{t("language.ru")}</option>
          </select>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-200">
            {t("auth.email")}
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field-input-dark mt-2"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-200">
            {t("auth.password")}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field-input-dark mt-2"
              required
            />
          </label>

          <div className="text-right">
            <Link to="/forgot-password" className="text-sm font-medium text-teal-200 underline decoration-teal-200/40">
              {t("auth.forgotPasswordLink")}
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? t("common.loading") : t("auth.loginButton")}
          </button>

          {pendingVerificationEmail ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-left">
              <p className="text-sm font-semibold text-amber-900">{t("auth.verify.loginBlockedTitle")}</p>
              <p className="mt-2 text-sm text-amber-800">{t("auth.verify.loginBlockedDescription", { email: pendingVerificationEmail })}</p>
              <button type="button" disabled={resending} onClick={handleResendVerification} className="app-btn-secondary mt-4">
                {resending ? t("common.loading") : t("auth.verify.resendAction")}
              </button>
            </div>
          ) : null}
        </form>

        <p className="mt-6 text-center text-sm text-slate-300">
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="font-semibold text-white underline decoration-white/50">
            {t("auth.registerLink")}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
