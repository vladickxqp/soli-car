import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const featureIcons = [
  "fleet",
  "companies",
  "history",
  "maintenance",
  "documents",
  "analytics",
] as const;

const iconByFeature = {
  fleet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M5 16l1.7-5.2A2 2 0 0 1 8.6 9h6.8a2 2 0 0 1 1.9 1.4L19 16" />
      <path d="M4 16h16v3a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M7.5 12h9" />
    </svg>
  ),
  companies: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M4 20V8l8-4 8 4v12" />
      <path d="M9 20v-5h6v5M9 10h.01M15 10h.01" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M12 8v4l3 3" />
      <path d="M3.05 11a9 9 0 1 1 .5 4" />
      <path d="M3 4v5h5" />
    </svg>
  ),
  maintenance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="m14.7 6.3 3 3" />
      <path d="M5 19 14 10l4 4-9 9H5z" />
      <path d="m10 6 2-2a2.8 2.8 0 0 1 4 4l-2 2" />
    </svg>
  ),
  documents: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M4 20h16" />
      <path d="M7 16v-5M12 16V8M17 16v-8" />
    </svg>
  ),
} satisfies Record<(typeof featureIcons)[number], JSX.Element>;

const LandingPage = () => {
  const { t, i18n } = useTranslation();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.16),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef6ff_46%,_#ffffff_100%)] text-slate-950">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-6 sm:px-6 xl:px-8">
        <div>
          <p className="text-2xl font-semibold tracking-tight">Soli Car</p>
          <p className="mt-1 text-sm text-slate-500">{t("landing.headerSubtitle")}</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={i18n.resolvedLanguage ?? "en"}
            onChange={(event) => i18n.changeLanguage(event.target.value)}
            aria-label={t("settings.language.title")}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
          >
            <option value="en">{t("language.en")}</option>
            <option value="de">{t("language.de")}</option>
            <option value="ru">{t("language.ru")}</option>
          </select>
          <Link to="/login" className="app-btn-secondary hidden sm:inline-flex">
            {t("landing.cta.login")}
          </Link>
          <Link to="/register" className="app-btn-primary">
            {t("landing.cta.register")}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 xl:px-8">
        <section className="grid gap-6 overflow-hidden rounded-[36px] border border-white/70 bg-white/90 px-6 py-8 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1.3fr)_380px] xl:px-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-teal-600">{t("landing.hero.kicker")}</p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              {t("landing.hero.title")}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">{t("landing.hero.subtitle")}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="app-btn-primary">
                {t("landing.cta.login")}
              </Link>
              <Link to="/register" className="app-btn-secondary">
                {t("landing.cta.register")}
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {(["companies", "vehicles", "activity"] as const).map((statKey) => (
                <div key={statKey} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {t(`landing.stats.${statKey}.label`)}
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">{t(`landing.stats.${statKey}.value`)}</p>
                  <p className="mt-2 text-sm text-slate-500">{t(`landing.stats.${statKey}.description`)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] bg-[linear-gradient(160deg,_#0f172a_0%,_#0f766e_100%)] p-6 text-white shadow-[0_24px_90px_-48px_rgba(15,23,42,0.7)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-100">{t("landing.snapshot.kicker")}</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">{t("landing.snapshot.title")}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-200">{t("landing.snapshot.subtitle")}</p>

            <div className="mt-6 space-y-3">
              {(["transfers", "compliance", "ownership"] as const).map((item) => (
                <div key={item} className="rounded-[22px] border border-white/10 bg-white/10 px-4 py-4">
                  <p className="text-sm font-semibold text-white">{t(`landing.snapshot.items.${item}.title`)}</p>
                  <p className="mt-2 text-sm text-slate-200">{t(`landing.snapshot.items.${item}.description`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-12">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{t("landing.features.kicker")}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{t("landing.features.title")}</h2>
            <p className="mt-3 text-base leading-8 text-slate-600">{t("landing.features.subtitle")}</p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featureIcons.map((featureKey) => (
              <article key={featureKey} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.28)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                  {iconByFeature[featureKey]}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{t(`landing.features.items.${featureKey}.title`)}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{t(`landing.features.items.${featureKey}.description`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-3">
          {(["visibility", "security", "demo"] as const).map((item) => (
            <article key={item} className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-[0_24px_70px_-56px_rgba(15,23,42,0.24)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t(`landing.assurance.${item}.kicker`)}</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">{t(`landing.assurance.${item}.title`)}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{t(`landing.assurance.${item}.description`)}</p>
            </article>
          ))}
        </section>

        <section className="mt-12 rounded-[36px] border border-slate-200 bg-slate-950 px-6 py-8 text-white shadow-[0_40px_110px_-64px_rgba(15,23,42,0.7)] sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-200">{t("landing.finalCta.kicker")}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t("landing.finalCta.title")}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">{t("landing.finalCta.subtitle")}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to="/login" className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
                {t("landing.cta.login")}
              </Link>
              <Link to="/register" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15">
                {t("landing.cta.register")}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default LandingPage;
