import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { authRegister, fetchInvitationPreview } from "../api";
import { getErrorMessage } from "../errors";
import { InvitationPreview, RegistrationType } from "../types";
import { storeVerificationPreview } from "../verificationPreview";

const RegisterPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const invitationToken = searchParams.get("invite") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [registrationType, setRegistrationType] = useState<RegistrationType>("COMPANY");
  const [invitationPreview, setInvitationPreview] = useState<InvitationPreview | null>(null);
  const [loadingInvitation, setLoadingInvitation] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!invitationToken) {
      setInvitationPreview(null);
      return;
    }

    let cancelled = false;
    setLoadingInvitation(true);

    fetchInvitationPreview(invitationToken)
      .then((preview) => {
        if (cancelled) {
          return;
        }

        setInvitationPreview(preview);
        setRegistrationType("COMPANY");
        setEmail(preview.email);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(getErrorMessage(error, t));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingInvitation(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [invitationToken, t]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const data = await authRegister({
        email,
        password,
        registrationType,
        companyName: registrationType === "COMPANY" ? companyName : undefined,
        invitationToken: invitationToken || undefined,
      });
      storeVerificationPreview(data.email, data.previewUrl);
      toast.success(t("auth.registerSuccess"));
      navigate(`/verify-email?email=${encodeURIComponent(data.email)}`);
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_35%),linear-gradient(180deg,_#082f49_0%,_#0f172a_100%)] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-sky-200">Soli Car</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t("auth.registerTitle")}</h1>
            <p className="mt-2 text-sm text-slate-300">{t("auth.registerSubtitle")}</p>
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

        <div className="mb-6 grid gap-3">
          {invitationToken ? (
            <div className="rounded-[24px] border border-sky-300/60 bg-sky-400/20 p-4">
              <p className="text-sm font-semibold text-white">{t("auth.invitation.title")}</p>
              {loadingInvitation ? (
                <p className="mt-2 text-sm text-slate-300">{t("common.loading")}</p>
              ) : invitationPreview ? (
                <div className="mt-2 space-y-2 text-sm text-slate-200">
                  <p>{t("auth.invitation.company", { company: invitationPreview.company.name })}</p>
                  <p>{t("auth.invitation.role", { role: t(`roles.${invitationPreview.role}`) })}</p>
                  <p>{t("auth.invitation.expires", { date: invitationPreview.expiresAt })}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setRegistrationType("COMPANY")}
                className={`rounded-[24px] border p-4 text-left transition ${
                  registrationType === "COMPANY"
                    ? "border-sky-300 bg-sky-400/20"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <p className="text-sm font-semibold text-white">{t("auth.registration.companyTitle")}</p>
                <p className="mt-2 text-sm text-slate-300">{t("auth.registration.companyDescription")}</p>
              </button>

              <button
                type="button"
                onClick={() => setRegistrationType("INDIVIDUAL")}
                className={`rounded-[24px] border p-4 text-left transition ${
                  registrationType === "INDIVIDUAL"
                    ? "border-sky-300 bg-sky-400/20"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <p className="text-sm font-semibold text-white">{t("auth.registration.individualTitle")}</p>
                <p className="mt-2 text-sm text-slate-300">{t("auth.registration.individualDescription")}</p>
              </button>
            </>
          )}
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {registrationType === "COMPANY" && !invitationToken ? (
            <>
              <label className="block text-sm font-medium text-slate-200">
                {t("auth.companyName")}
                <input
                  autoComplete="organization"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="field-input-dark mt-2"
                  required
                />
              </label>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                {t("auth.registration.companyHint")}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              {t("auth.registration.individualHint")}
            </div>
          )}

          <label className="block text-sm font-medium text-slate-200">
            {t("auth.email")}
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field-input-dark mt-2"
              disabled={Boolean(invitationToken)}
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-200">
            {t("auth.password")}
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field-input-dark mt-2"
              minLength={8}
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? t("common.loading") : t("auth.registerButton")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-300">
          {t("auth.hasAccount")}{" "}
          <Link to="/login" className="font-semibold text-white underline decoration-white/50">
            {t("auth.loginLink")}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
