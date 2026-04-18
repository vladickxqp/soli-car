import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchPublicVehicleSnapshot } from "../api";
import EmptyState from "../components/EmptyState";
import LoadingCard from "../components/LoadingCard";
import StatusBadge from "../components/StatusBadge";
import { getErrorMessage } from "../errors";
import { formatCurrency, formatDate, formatFileSize, formatNumber } from "../formatters";
import { PublicVehicleSnapshot } from "../types";

const PublicVehicleSharePage = () => {
  const { token } = useParams();
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<PublicVehicleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError(t("publicShare.invalid"));
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchPublicVehicleSnapshot(token)
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data);
          setError("");
        }
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
  }, [t, token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <LoadingCard label={t("publicShare.loading")} />
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <EmptyState title={t("publicShare.emptyTitle")} description={error || t("publicShare.emptyDescription")} />
      </div>
    );
  }

  const { vehicle, shareLink } = snapshot;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.08),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="shell-panel-strong p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-600">{t("publicShare.kicker")}</p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{vehicle.model}</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">{t("publicShare.subtitle")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge status={vehicle.status} />
                {vehicle.archivedAt ? <StatusBadge label={t("vehicles.archivedBadge")} tone="slate" /> : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t("publicShare.company")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{vehicle.company.name}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t("publicShare.sharedAt")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{formatDate(shareLink.createdAt)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("publicShare.overview")}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.plate")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{vehicle.plate}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.driver")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{vehicle.driver}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.firstRegistration")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{formatDate(vehicle.firstRegistration)}</p>
              </div>
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.mileage")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{formatNumber(vehicle.mileage)}</p>
              </div>
            </div>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("publicShare.trustKicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("publicShare.trustTitle")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("publicShare.trustSubtitle")}</p>

            <div className="mt-5 grid gap-4">
              <div className="shell-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("publicShare.readOnly")}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{t("publicShare.readOnlySubtitle")}</p>
              </div>
              {shareLink.expiresAt ? (
                <div className="shell-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("publicShare.expiresAt")}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{formatDate(shareLink.expiresAt)}</p>
                </div>
              ) : null}
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("publicShare.incidents")}</p>
            <div className="mt-4 space-y-3">
              {vehicle.incidents.length === 0 ? (
                <EmptyState title={t("publicShare.noIncidentsTitle")} description={t("publicShare.noIncidentsDescription")} />
              ) : (
                vehicle.incidents.map((incident) => (
                  <div key={incident.id} className="shell-muted p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{incident.title}</p>
                      <StatusBadge label={t(`incidentStatus.${incident.status}`)} tone={incident.status === "REPAIRED" ? "green" : "yellow"} />
                    </div>
                    <p className="mt-3 text-sm text-slate-600">{incident.description}</p>
                    <p className="mt-3 text-xs text-slate-500">{formatDate(incident.occurredAt)}</p>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("publicShare.maintenance")}</p>
            <div className="mt-4 space-y-3">
              {vehicle.maintenanceRecords.length === 0 ? (
                <EmptyState title={t("publicShare.noMaintenanceTitle")} description={t("publicShare.noMaintenanceDescription")} />
              ) : (
                vehicle.maintenanceRecords.map((record) => (
                  <div key={record.id} className="shell-muted p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{record.title}</p>
                      <StatusBadge label={t(`vehicleDetails.maintenance.status.${record.status}`)} tone={record.status === "COMPLETED" ? "green" : record.status === "IN_PROGRESS" ? "yellow" : "blue"} />
                    </div>
                    {record.description ? <p className="mt-3 text-sm text-slate-600">{record.description}</p> : null}
                    {record.cost != null ? <p className="mt-3 text-xs text-slate-500">{formatCurrency(record.cost)}</p> : null}
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("publicShare.documents")}</p>
            <div className="mt-4 space-y-3">
              {vehicle.documents.length === 0 ? (
                <EmptyState title={t("publicShare.noDocumentsTitle")} description={t("publicShare.noDocumentsDescription")} />
              ) : (
                vehicle.documents.map((document) => (
                  <div key={document.id} className="shell-muted p-4">
                    <p className="text-sm font-semibold text-slate-950">{document.title}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {document.originalName} · {formatFileSize(document.sizeBytes)}
                    </p>
                    {document.expiryDate ? <p className="mt-2 text-xs text-slate-500">{formatDate(document.expiryDate)}</p> : null}
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <div className="pb-4 text-center text-sm text-slate-500">
          <Link to="/login" className="font-medium text-slate-700 underline decoration-slate-300">
            {t("auth.backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PublicVehicleSharePage;
