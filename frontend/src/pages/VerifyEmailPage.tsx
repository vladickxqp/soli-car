import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ApiError, resendVerificationEmail, verifyEmailToken } from "../api";
import { getErrorMessage } from "../errors";
import { useAuthStore } from "../store";
import { clearVerificationPreview, readVerificationPreview, storeVerificationPreview } from "../verificationPreview";

const VerifyEmailPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const token = searchParams.get("token") ?? "";

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [verifying, setVerifying] = useState(Boolean(token));
  const [resending, setResending] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [error, setError] = useState("");
  const [expiredToken, setExpiredToken] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!email) {
      setPreviewUrl("");
      return;
    }

    setPreviewUrl(readVerificationPreview(email) ?? "");
  }, [email]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setVerifying(true);

    verifyEmailToken({ token })
      .then((data) => {
        if (cancelled) {
          return;
        }

        setAuth(data.token, data.user);
        setVerificationComplete(true);
        clearVerificationPreview(data.user.email);
        toast.success(t("auth.verify.success"));
        navigate("/onboarding", { replace: true });
      })
      .catch((verifyError) => {
        if (!cancelled) {
          setExpiredToken(verifyError instanceof ApiError && verifyError.code === "EMAIL_VERIFICATION_TOKEN_INVALID_OR_EXPIRED");
          setError(getErrorMessage(verifyError, t));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVerifying(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, setAuth, t, token]);

  const handleResend = async (event: FormEvent) => {
    event.preventDefault();
    if (!email) {
      return;
    }

    setResending(true);
    try {
      const data = await resendVerificationEmail({ email });
      storeVerificationPreview(email, data.previewUrl);
      setPreviewUrl(data.previewUrl ?? readVerificationPreview(email) ?? "");
      toast.success(t("auth.verify.resent"));
      setError("");
    } catch (resendError) {
      toast.error(getErrorMessage(resendError, t));
    } finally {
      setResending(false);
    }
  };

  const showResend = !verificationComplete && !verifying && (!token || error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-4 py-10">
      <div className="w-full max-w-xl rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.45)]">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-600">{t("auth.verify.kicker")}</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{t("auth.verify.title")}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">{t("auth.verify.subtitle")}</p>

        <div className="mt-6 grid gap-4 rounded-[28px] border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{t("auth.verify.trust.email")}</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{email || t("auth.verify.pendingEmail")}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{t("auth.verify.trust.status")}</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {verifying
                ? t("auth.verify.status.verifying")
                : verificationComplete
                  ? t("auth.verify.status.verified")
                  : t("auth.verify.status.pending")}
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {verifying ? (
          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-600">
            {t("auth.verify.verifying")}
          </div>
        ) : null}

        {showResend ? (
          <form className="mt-6 space-y-4" onSubmit={handleResend}>
            <label htmlFor="verification-email" className="block text-sm font-medium text-slate-700">
              {t("auth.email")}
              <input
                id="verification-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field-input mt-2"
                required
              />
            </label>

            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              {expiredToken ? t("auth.verify.expiredHint") : t("auth.verify.resendHint")}
            </div>

            <button type="submit" disabled={resending} className="app-btn-primary w-full justify-center">
              {resending ? t("common.loading") : t("auth.verify.resendAction")}
            </button>
          </form>
        ) : null}

        {previewUrl && !verificationComplete ? (
          <div className="mt-6 rounded-[28px] border border-teal-200 bg-teal-50 p-5 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-600">{t("auth.verify.demo.kicker")}</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">{t("auth.verify.demo.title")}</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">{t("auth.verify.demo.description")}</p>
            <a href={previewUrl} className="app-btn-primary mt-4 inline-flex">
              {t("auth.verify.demo.action")}
            </a>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <Link to="/login" className="font-medium text-slate-700 underline decoration-slate-300">
            {t("auth.backToLogin")}
          </Link>
          <span>{t("auth.verify.footer")}</span>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
