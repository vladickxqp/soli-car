import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { resetPassword } from "../api";
import { getErrorMessage } from "../errors";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!token) {
      toast.error(t("errors.codes.RESET_TOKEN_INVALID_OR_EXPIRED"));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t("settings.security.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      await resetPassword({ token, password });
      toast.success(t("auth.passwordResetSuccess"));
      navigate("/login");
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(13,148,136,0.18),_transparent_35%),linear-gradient(180deg,_#0f172a_0%,_#111827_100%)] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <p className="text-sm uppercase tracking-[0.25em] text-teal-200">Soli Car</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t("auth.resetPasswordTitle")}</h1>
        <p className="mt-2 text-sm text-slate-300">{t("auth.resetPasswordSubtitle")}</p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-200">
            {t("auth.newPassword")}
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field-input-dark mt-2"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-200">
            {t("auth.confirmPassword")}
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="field-input-dark mt-2"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? t("common.loading") : t("auth.resetPasswordButton")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-300">
          <Link to="/login" className="font-semibold text-white underline decoration-white/50">
            {t("auth.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
