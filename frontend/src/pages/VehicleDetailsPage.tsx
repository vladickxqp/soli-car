import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  archiveVehicle,
  createVehicleShareLink,
  createMaintenanceRecord,
  deleteMaintenanceRecord,
  deleteVehicleDocument,
  fetchCompanies,
  fetchHistory,
  fetchVehicleShareLinks,
  fetchVehicle,
  fetchVehicleDocumentBlob,
  revokeVehicleShareLink,
  restoreMaintenanceRecord,
  restoreVehicle,
  restoreVehicleDocument,
  resolveAssetUrl,
  transferVehicle,
  updateMaintenanceRecord,
  updateVehicleStatus,
  uploadIncidentAttachment,
  uploadVehicleDocument,
} from "../api";
import EmptyState from "../components/EmptyState";
import HistoryTimeline from "../components/HistoryTimeline";
import LoadingCard from "../components/LoadingCard";
import StatusBadge from "../components/StatusBadge";
import { getErrorMessage } from "../errors";
import { formatCurrency, formatDate, formatFileSize, formatNumber } from "../formatters";
import { canManageVehicles, canTransferVehicles } from "../permissions";
import { useAuthStore } from "../store";
import {
  Company,
  MaintenanceStatus,
  Vehicle,
  VehicleDamageStatus,
  VehicleDocument,
  VehicleHistory,
  VehicleIncidentStatus,
  VehicleMaintenanceRecord,
  VehiclePublicShareLink,
  VehicleStatus,
} from "../types";
import { exportVehiclePdfLazy } from "../utils/exportVehiclePdfLazy";

const TABS = ["overview", "history", "incidents", "maintenance", "documents"] as const;
const EDITABLE_STATUS_OPTIONS: VehicleStatus[] = [
  "ACTIVE",
  "IN_SERVICE",
  "UNDER_REPAIR",
  "INACTIVE",
  "DAMAGED",
  "IN_LEASING",
  "SOLD",
  "MAINTENANCE",
];
const MAINTENANCE_STATUSES: MaintenanceStatus[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELED"];
const DOCUMENT_TYPES = ["REGISTRATION", "INSURANCE", "CONTRACT", "SERVICE", "PHOTO", "OTHER"] as const;

type VehicleTab = (typeof TABS)[number];

const getDamageTone = (status: VehicleDamageStatus): "blue" | "green" | "yellow" | "red" => {
  switch (status) {
    case "REPORTED":
      return "red";
    case "UNDER_REPAIR":
      return "yellow";
    case "REPAIRED":
      return "green";
    default:
      return "blue";
  }
};

const getIncidentTone = (status: VehicleIncidentStatus): "green" | "yellow" =>
  status === "REPAIRED" ? "green" : "yellow";

const getMaintenanceTone = (status: MaintenanceStatus): "blue" | "green" | "yellow" | "red" => {
  switch (status) {
    case "COMPLETED":
      return "green";
    case "IN_PROGRESS":
      return "yellow";
    case "CANCELED":
      return "red";
    default:
      return "blue";
  }
};

const emptyMaintenance = {
  title: "",
  description: "",
  status: "SCHEDULED" as MaintenanceStatus,
  serviceDate: "",
  completedAt: "",
  cost: "",
  vendor: "",
  mileage: "",
  reminderDate: "",
};

const VehicleDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [history, setHistory] = useState<VehicleHistory[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentType, setDocumentType] = useState<(typeof DOCUMENT_TYPES)[number] | "OTHER">("OTHER");
  const [documentExpiry, setDocumentExpiry] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [maintenanceDraft, setMaintenanceDraft] = useState(emptyMaintenance);
  const [editingMaintenanceId, setEditingMaintenanceId] = useState<string | null>(null);
  const [incidentUploadState, setIncidentUploadState] = useState<Record<string, { title: string; file: File | null }>>({});
  const [shareLinks, setShareLinks] = useState<VehiclePublicShareLink[]>([]);
  const [creatingShareLink, setCreatingShareLink] = useState(false);

  const activeTab = (TABS.includes(searchParams.get("tab") as VehicleTab) ? searchParams.get("tab") : "overview") as VehicleTab;
  const canEdit = canManageVehicles(user?.role);
  const canTransfer = canTransferVehicles(user);

  const loadPage = useCallback(async () => {
    if (!token || !id) {
      return;
    }

    const [vehicleData, historyData, companyData, shareLinkData] = await Promise.all([
      fetchVehicle(token, id),
      fetchHistory(token, id),
      canTransfer ? fetchCompanies(token) : Promise.resolve([] as Company[]),
      canEdit ? fetchVehicleShareLinks(token, id) : Promise.resolve([] as VehiclePublicShareLink[]),
    ]);

    setVehicle(vehicleData);
    setHistory(historyData);
    setCompanies(companyData.filter((company) => company.id !== vehicleData.companyId));
    setShareLinks(shareLinkData);
  }, [canEdit, canTransfer, id, token]);

  useEffect(() => {
    if (!token || !id) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadPage()
      .then(() => {
        if (!cancelled) setError("");
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError, t));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, loadPage, t, token]);

  const setTab = (tab: VehicleTab) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tab);
    setSearchParams(nextParams, { replace: true });
  };

  const reload = async () => {
    await loadPage();
  };

  const handleArchiveVehicle = async () => {
    if (!token || !id || !vehicle || !canEdit) return;
    if (!window.confirm(t("vehicleDetails.archiveConfirm", { vehicle: `${vehicle.model} / ${vehicle.plate}` }))) return;
    const reason = window.prompt(t("vehicleDetails.archiveReasonPrompt"), vehicle.archiveReason ?? "");
    if (reason === null) return;
    try {
      await archiveVehicle(token, id, reason || undefined);
      toast.success(t("vehicleDetails.archiveSuccess"));
      await reload();
    } catch (archiveError) {
      toast.error(getErrorMessage(archiveError, t));
    }
  };

  const handleRestoreVehicle = async () => {
    if (!token || !id || !vehicle || !canEdit) return;
    if (!window.confirm(t("vehicleDetails.restoreConfirm", { vehicle: `${vehicle.model} / ${vehicle.plate}` }))) return;
    try {
      await restoreVehicle(token, id);
      toast.success(t("vehicleDetails.restoreSuccess"));
      await reload();
    } catch (restoreError) {
      toast.error(getErrorMessage(restoreError, t));
    }
  };

  const handleExport = async () => {
    if (!vehicle) return;
    setExporting(true);
    const toastId = toast.loading(t("pdf.preparing"));
    try {
      await exportVehiclePdfLazy({ vehicle, history, t });
      toast.success(t("pdf.ready"), { id: toastId });
    } catch (exportError) {
      toast.error(getErrorMessage(exportError, t), { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const handleCreateShareLink = async () => {
    if (!token || !vehicle || isArchived) {
      return;
    }

    const label = window.prompt(t("vehicleDetails.share.prompt"), `${vehicle.model} / ${vehicle.plate}`);
    if (label === null) {
      return;
    }

    setCreatingShareLink(true);
    try {
      const shareLink = await createVehicleShareLink(token, vehicle.id, {
        label: label || undefined,
        expiresInDays: 14,
      });
      setShareLinks((current) => [shareLink, ...current.filter((item) => item.id !== shareLink.id)]);
      if (shareLink.shareUrl && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink.shareUrl);
      }
      toast.success(t("vehicleDetails.share.created"));
    } catch (shareError) {
      toast.error(getErrorMessage(shareError, t));
    } finally {
      setCreatingShareLink(false);
    }
  };

  const handleRevokeShareLink = async (shareLinkId: string) => {
    if (!token || !vehicle) {
      return;
    }

    try {
      await revokeVehicleShareLink(token, vehicle.id, shareLinkId);
      setShareLinks((current) =>
        current.map((link) => (link.id === shareLinkId ? { ...link, revokedAt: new Date().toISOString() } : link)),
      );
      toast.success(t("vehicleDetails.share.revoked"));
    } catch (shareError) {
      toast.error(getErrorMessage(shareError, t));
    }
  };

  const handleStatusUpdate = async (status: VehicleStatus) => {
    if (!token || !vehicle) return;
    setSubmitting(true);
    try {
      await updateVehicleStatus(token, vehicle.id, status);
      toast.success(t("messages.statusUpdated"));
      await reload();
    } catch (statusError) {
      toast.error(getErrorMessage(statusError, t));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransfer = async () => {
    if (!token || !vehicle || !targetCompanyId) return;
    setSubmitting(true);
    try {
      await transferVehicle(token, vehicle.id, targetCompanyId);
      toast.success(t("messages.vehicleTransferred"));
      setTargetCompanyId("");
      await reload();
    } catch (transferError) {
      toast.error(getErrorMessage(transferError, t));
    } finally {
      setSubmitting(false);
    }
  };

  const openDocument = async (document: VehicleDocument) => {
    if (!token) return;
    try {
      const blob = await fetchVehicleDocumentBlob(token, document.id);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (documentError) {
      toast.error(getErrorMessage(documentError, t));
    }
  };

  const handleDeleteDocument = async (document: VehicleDocument) => {
    if (!token || !vehicle || !canEdit) return;
    try {
      await deleteVehicleDocument(token, vehicle.id, document.id);
      toast.success(t("vehicleDetails.documents.deleted"));
      await reload();
    } catch (documentError) {
      toast.error(getErrorMessage(documentError, t));
    }
  };

  const handleRestoreDocument = async (document: VehicleDocument) => {
    if (!token || !vehicle || !canEdit) return;
    try {
      await restoreVehicleDocument(token, vehicle.id, document.id);
      toast.success(t("vehicleDetails.documents.restored"));
      await reload();
    } catch (documentError) {
      toast.error(getErrorMessage(documentError, t));
    }
  };

  const handleUploadDocument = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !vehicle || !documentFile) return;
    setSubmitting(true);
    try {
      await uploadVehicleDocument(token, vehicle.id, {
        title: documentTitle,
        documentType,
        expiryDate: documentExpiry || undefined,
        file: documentFile,
      });
      toast.success(t("vehicleDetails.documents.uploaded"));
      setDocumentTitle("");
      setDocumentType("OTHER");
      setDocumentExpiry("");
      setDocumentFile(null);
      await reload();
    } catch (documentError) {
      toast.error(getErrorMessage(documentError, t));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadIncidentAttachment = async (incidentId: string) => {
    if (!token || !vehicle) return;
    const state = incidentUploadState[incidentId];
    if (!state?.file) {
      toast.error(t("vehicleDetails.incidents.selectAttachment"));
      return;
    }
    setSubmitting(true);
    try {
      await uploadIncidentAttachment(token, vehicle.id, incidentId, {
        title: state.title || state.file.name,
        file: state.file,
      });
      toast.success(t("vehicleDetails.incidents.attachmentUploaded"));
      setIncidentUploadState((current) => ({ ...current, [incidentId]: { title: "", file: null } }));
      await reload();
    } catch (attachmentError) {
      toast.error(getErrorMessage(attachmentError, t));
    } finally {
      setSubmitting(false);
    }
  };

  const startEditMaintenance = (record: VehicleMaintenanceRecord) => {
    setEditingMaintenanceId(record.id);
    setMaintenanceDraft({
      title: record.title,
      description: record.description ?? "",
      status: record.status,
      serviceDate: record.serviceDate?.slice(0, 10) ?? "",
      completedAt: record.completedAt?.slice(0, 10) ?? "",
      cost: record.cost != null ? String(record.cost) : "",
      vendor: record.vendor ?? "",
      mileage: record.mileage != null ? String(record.mileage) : "",
      reminderDate: record.reminderDate?.slice(0, 10) ?? "",
    });
  };

  const submitMaintenance = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !vehicle) return;
    setSubmitting(true);
    const payload = {
      title: maintenanceDraft.title,
      description: maintenanceDraft.description || undefined,
      status: maintenanceDraft.status,
      serviceDate: maintenanceDraft.serviceDate || undefined,
      completedAt: maintenanceDraft.completedAt || undefined,
      cost: maintenanceDraft.cost || undefined,
      vendor: maintenanceDraft.vendor || undefined,
      mileage: maintenanceDraft.mileage ? Number(maintenanceDraft.mileage) : undefined,
      reminderDate: maintenanceDraft.reminderDate || undefined,
    };
    try {
      if (editingMaintenanceId) {
        await updateMaintenanceRecord(token, vehicle.id, editingMaintenanceId, payload);
        toast.success(t("vehicleDetails.maintenance.updated"));
      } else {
        await createMaintenanceRecord(token, vehicle.id, payload);
        toast.success(t("vehicleDetails.maintenance.created"));
      }
      setEditingMaintenanceId(null);
      setMaintenanceDraft(emptyMaintenance);
      await reload();
    } catch (maintenanceError) {
      toast.error(getErrorMessage(maintenanceError, t));
    } finally {
      setSubmitting(false);
    }
  };

  const removeMaintenance = async (recordId: string) => {
    if (!token || !vehicle || !canEdit) return;
    try {
      await deleteMaintenanceRecord(token, vehicle.id, recordId);
      toast.success(t("vehicleDetails.maintenance.deleted"));
      if (editingMaintenanceId === recordId) {
        setEditingMaintenanceId(null);
        setMaintenanceDraft(emptyMaintenance);
      }
      await reload();
    } catch (maintenanceError) {
      toast.error(getErrorMessage(maintenanceError, t));
    }
  };

  const restoreMaintenance = async (recordId: string) => {
    if (!token || !vehicle || !canEdit) return;
    try {
      await restoreMaintenanceRecord(token, vehicle.id, recordId);
      toast.success(t("vehicleDetails.maintenance.restored"));
      await reload();
    } catch (maintenanceError) {
      toast.error(getErrorMessage(maintenanceError, t));
    }
  };

  const statusOptions = useMemo(() => {
    if (!vehicle) {
      return EDITABLE_STATUS_OPTIONS;
    }

    if (vehicle.status === "TRANSFERRED") {
      return ["TRANSFERRED", ...EDITABLE_STATUS_OPTIONS] as VehicleStatus[];
    }

    if (vehicle.status === "ARCHIVED") {
      return ["ARCHIVED", ...EDITABLE_STATUS_OPTIONS] as VehicleStatus[];
    }

    return vehicle.status && !EDITABLE_STATUS_OPTIONS.includes(vehicle.status)
      ? ([vehicle.status, ...EDITABLE_STATUS_OPTIONS] as VehicleStatus[])
      : EDITABLE_STATUS_OPTIONS;
  }, [vehicle]);

  if (loading) return <LoadingCard label={t("vehicleDetails.loading")} />;
  if (!vehicle) return <div className="rounded-[28px] border border-rose-200 bg-rose-50 px-6 py-6 text-sm text-rose-700">{error || t("vehicleDetails.notFound")}</div>;

  const archiveTimestamp = vehicle.archivedAt || vehicle.deletedAt || null;
  const isArchived = Boolean(archiveTimestamp || vehicle.status === "ARCHIVED");
  const activeDocuments = vehicle.documents.filter((document) => !document.archivedAt);
  const archivedDocuments = vehicle.documents.filter((document) => Boolean(document.archivedAt));
  const activeMaintenanceRecords = vehicle.maintenanceRecords.filter((record) => !record.archivedAt);
  const archivedMaintenanceRecords = vehicle.maintenanceRecords.filter((record) => Boolean(record.archivedAt));

  const summaryFields = [
    [t("vehicle.company"), vehicle.company?.name ?? "-"],
    [t("vehicle.vin"), vehicle.vin],
    [t("vehicle.driver"), vehicle.driver || "-"],
    [t("vehicle.mileage"), t("units.kilometers", { value: formatNumber(vehicle.mileage) })],
    [t("vehicle.yearlyMileage"), t("units.kilometers", { value: formatNumber(vehicle.yearlyMileage) })],
    [t("vehicle.contractEnd"), formatDate(vehicle.contractEnd)],
    [t("vehicle.insuranceEnd"), formatDate(vehicle.insuranceEnd)],
    [t("vehicle.price"), formatCurrency(vehicle.price)],
  ];

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong overflow-hidden p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-5">
            {vehicle.imageUrl ? (
              <img src={resolveAssetUrl(vehicle.imageUrl)} alt={vehicle.model} className="h-24 w-24 rounded-[26px] object-cover shadow-lg" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-[26px] bg-slate-950 text-2xl font-semibold text-white">{vehicle.model.slice(0, 2).toUpperCase()}</div>
            )}
            <div>
              <p className="shell-kicker">{t("vehicleDetails.overview")}</p>
              <h1 className="shell-title mt-3">{vehicle.model}</h1>
              <p className="shell-subtitle">{vehicle.plate} / {vehicle.company?.name}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge status={vehicle.status} />
                <StatusBadge label={t(`damageStatus.${vehicle.damageStatus}`)} tone={getDamageTone(vehicle.damageStatus)} />
                {vehicle.hadPreviousAccidents ? <StatusBadge label={t("vehicle.accidentHistory")} tone="yellow" /> : <StatusBadge label={t("vehicle.noAccidentHistory")} tone="green" />}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleExport} disabled={exporting} className="app-btn-primary">{exporting ? t("pdf.exporting") : t("pdf.export")}</button>
            <Link to={`/vehicles/${vehicle.id}/edit`} className={`app-btn-secondary ${!canEdit || isArchived ? "pointer-events-none opacity-50" : ""}`}>{t("common.edit")}</Link>
            {isArchived ? (
              <button type="button" onClick={handleRestoreVehicle} disabled={!canEdit} className="app-btn-secondary">{t("common.restore")}</button>
            ) : (
              <button type="button" onClick={handleArchiveVehicle} disabled={!canEdit} className="app-btn-ghost">{t("common.archive")}</button>
            )}
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {isArchived ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold">{t("vehicleDetails.archivedTitle")}</p>
              <p className="mt-2 text-sm text-amber-800">{t("vehicleDetails.archivedDescription")}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-amber-900">
                {archiveTimestamp ? <span className="app-chip">{t("vehicleDetails.archivedAt", { date: formatDate(archiveTimestamp) })}</span> : null}
                {vehicle.archiveReason ? <span className="app-chip">{vehicle.archiveReason}</span> : null}
              </div>
            </div>
            {canEdit ? (
              <button type="button" onClick={handleRestoreVehicle} className="app-btn-primary">
                {t("common.restore")}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="shell-panel p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setTab(tab)} className={`app-tab ${activeTab === tab ? "app-tab-active" : ""}`}>
              {t(`vehicleDetails.tabs.${tab}`)}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <section className="shell-panel p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              {summaryFields.map(([label, value]) => (
                <div key={label} className="shell-muted px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</dt>
                  <dd className="mt-2 text-sm font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <article className="shell-panel p-5 sm:p-6">
              <p className="shell-kicker">{t("vehicleDetails.statusPanel")}</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("vehicleDetails.statusTitle")}</h2>
              <div className="mt-5 space-y-4">
                <select value={vehicle.status} onChange={(event) => void handleStatusUpdate(event.target.value as VehicleStatus)} disabled={!canEdit || submitting || isArchived} className="field-input">
                  {statusOptions.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
                </select>
                {canTransfer && !isArchived ? (
                  <div className="space-y-3">
                    <select value={targetCompanyId} onChange={(event) => setTargetCompanyId(event.target.value)} className="field-input">
                      <option value="">{t("vehicleDetails.selectCompany")}</option>
                      {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select>
                    <button type="button" onClick={handleTransfer} disabled={!targetCompanyId || submitting} className="app-btn-primary w-full">{t("common.transfer")}</button>
                  </div>
                ) : null}
              </div>
            </article>

            <article className="shell-panel p-5 sm:p-6">
              <p className="shell-kicker">{t("vehicleDetails.damageKicker")}</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("vehicleDetails.damageTitle")}</h2>
              <div className="mt-4 shell-muted px-4 py-3">
                <p className="text-sm text-slate-700">{vehicle.damageNotes || "-"}</p>
              </div>
            </article>

            <article className="shell-panel p-5 sm:p-6">
              <p className="shell-kicker">{t("vehicleDetails.share.kicker")}</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("vehicleDetails.share.title")}</h2>
              <p className="mt-2 text-sm text-slate-500">{t("vehicleDetails.share.subtitle")}</p>

              {canEdit ? (
                <button type="button" onClick={handleCreateShareLink} disabled={creatingShareLink || isArchived} className="app-btn-secondary mt-5">
                  {creatingShareLink ? t("common.loading") : t("vehicleDetails.share.createAction")}
                </button>
              ) : null}

              <div className="mt-5 space-y-3">
                {shareLinks.length === 0 ? (
                  <EmptyState title={t("vehicleDetails.share.emptyTitle")} description={t("vehicleDetails.share.emptyDescription")} />
                ) : (
                  shareLinks.map((link) => (
                    <div key={link.id} className="shell-muted px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{link.label || t("vehicleDetails.share.defaultLabel")}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(link.createdAt)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {link.revokedAt ? <StatusBadge label={t("vehicleDetails.share.revokedBadge")} tone="slate" /> : <StatusBadge label={t("vehicleDetails.share.activeBadge")} tone="green" />}
                          <StatusBadge label={t("vehicleDetails.share.accessCount", { count: link.accessCount })} tone="blue" />
                        </div>
                      </div>
                      {link.shareUrl ? <p className="mt-3 break-all text-xs text-slate-500">{link.shareUrl}</p> : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {link.shareUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (navigator.clipboard?.writeText && link.shareUrl) {
                                void navigator.clipboard.writeText(link.shareUrl);
                              }
                            }}
                            className="app-btn-secondary"
                          >
                            {t("vehicleDetails.share.copyAction")}
                          </button>
                        ) : null}
                        {canEdit && !link.revokedAt ? (
                          <button type="button" onClick={() => void handleRevokeShareLink(link.id)} className="app-btn-ghost">
                            {t("vehicleDetails.share.revokeAction")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {activeTab === "history" ? (
        <section className="shell-panel p-5 sm:p-6">
          <HistoryTimeline history={history} />
        </section>
      ) : null}

      {activeTab === "incidents" ? (
        <section className="space-y-6">
          {vehicle.incidents.length === 0 ? (
            <section className="shell-panel p-6">
              <EmptyState title={t("vehicleDetails.incidentsEmptyTitle")} description={t("vehicleDetails.incidentsEmptyDescription")} />
            </section>
          ) : vehicle.incidents.map((incident) => (
            <article key={incident.id} className="shell-panel p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">{incident.title}</h2>
                  <p className="mt-2 text-sm text-slate-500">{formatDate(incident.occurredAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={t(`incidentStatus.${incident.status}`)} tone={getIncidentTone(incident.status)} />
                  {incident.repairedAt ? <StatusBadge label={t("vehicle.repairedBadge", { date: formatDate(incident.repairedAt) })} tone="green" /> : null}
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{incident.description}</p>
              {incident.repairNotes ? <div className="mt-4 shell-muted px-4 py-3 text-sm text-slate-700">{incident.repairNotes}</div> : null}

              <div className="mt-5 space-y-3">
                {incident.attachments.length === 0 ? (
                  <EmptyState title={t("vehicleDetails.incidents.noAttachmentsTitle")} description={t("vehicleDetails.incidents.noAttachmentsDescription")} />
                ) : incident.attachments.map((attachment) => (
                  <div key={attachment.id} className="shell-muted flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{attachment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{attachment.originalName} / {formatFileSize(attachment.sizeBytes)}</p>
                      {attachment.archiveReason ? <p className="mt-2 text-xs text-slate-500">{attachment.archiveReason}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {attachment.archivedAt ? <StatusBadge label={t("vehicleDetails.documents.archivedBadge")} tone="slate" /> : null}
                      <button type="button" onClick={() => void openDocument(attachment)} className="app-btn-secondary">{t("vehicleDetails.documents.openAction")}</button>
                      {canEdit && attachment.archivedAt ? <button type="button" onClick={() => void handleRestoreDocument(attachment)} className="app-btn-secondary">{t("common.restore")}</button> : null}
                      {canEdit && !attachment.archivedAt ? <button type="button" onClick={() => void handleDeleteDocument(attachment)} className="app-btn-ghost">{t("common.archive")}</button> : null}
                    </div>
                  </div>
                ))}
              </div>

              {canEdit && !isArchived ? (
                <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <input value={incidentUploadState[incident.id]?.title ?? ""} onChange={(event) => setIncidentUploadState((current) => ({ ...current, [incident.id]: { title: event.target.value, file: current[incident.id]?.file ?? null } }))} placeholder={t("vehicleDetails.incidents.attachmentTitle")} className="field-input" />
                  <input type="file" onChange={(event) => setIncidentUploadState((current) => ({ ...current, [incident.id]: { title: current[incident.id]?.title ?? "", file: event.target.files?.[0] ?? null } }))} className="field-input" />
                  <button type="button" onClick={() => void handleUploadIncidentAttachment(incident.id)} className="app-btn-primary">{t("vehicleDetails.incidents.uploadAttachment")}</button>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {activeTab === "maintenance" ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_400px]">
          <article className="shell-panel p-5 sm:p-6">
            <div className="space-y-4">
              {activeMaintenanceRecords.length === 0 ? (
                <EmptyState title={t("vehicleDetails.maintenance.emptyTitle")} description={t("vehicleDetails.maintenance.emptyDescription")} />
              ) : activeMaintenanceRecords.map((record) => (
                <div key={record.id} className="shell-muted px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{record.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{record.vendor || "-"} / {record.serviceDate ? formatDate(record.serviceDate) : "-"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge label={t(`vehicleDetails.maintenance.status.${record.status}`)} tone={getMaintenanceTone(record.status)} />
                      {record.cost != null ? <StatusBadge label={formatCurrency(record.cost)} tone="blue" /> : null}
                    </div>
                  </div>
                  {record.description ? <p className="mt-3 text-sm text-slate-700">{record.description}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {canEdit ? <button type="button" onClick={() => startEditMaintenance(record)} className="app-btn-secondary">{t("common.edit")}</button> : null}
                    {canEdit ? <button type="button" onClick={() => void removeMaintenance(record.id)} className="app-btn-ghost">{t("common.archive")}</button> : null}
                  </div>
                </div>
              ))}

              {archivedMaintenanceRecords.length > 0 ? (
                <div className="space-y-3 pt-2">
                  <p className="text-sm font-semibold text-slate-900">{t("vehicleDetails.maintenance.archivedTitle")}</p>
                  {archivedMaintenanceRecords.map((record) => (
                    <div key={record.id} className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{record.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{record.vendor || "-"} / {record.serviceDate ? formatDate(record.serviceDate) : "-"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge label={t("vehicleDetails.maintenance.archivedBadge")} tone="slate" />
                          {record.cost != null ? <StatusBadge label={formatCurrency(record.cost)} tone="blue" /> : null}
                        </div>
                      </div>
                      {record.archiveReason ? <p className="mt-3 text-sm text-slate-600">{record.archiveReason}</p> : null}
                      {canEdit ? (
                        <div className="mt-4">
                          <button type="button" onClick={() => void restoreMaintenance(record.id)} className="app-btn-secondary">
                            {t("common.restore")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <form className="space-y-4" onSubmit={submitMaintenance}>
              <input value={maintenanceDraft.title} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, title: event.target.value }))} placeholder={t("vehicleDetails.maintenance.fields.title")} className="field-input" required />
              <textarea value={maintenanceDraft.description} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, description: event.target.value }))} placeholder={t("vehicleDetails.maintenance.fields.description")} rows={4} className="field-input resize-y" />
              <select value={maintenanceDraft.status} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, status: event.target.value as MaintenanceStatus }))} className="field-input">
                {MAINTENANCE_STATUSES.map((status) => <option key={status} value={status}>{t(`vehicleDetails.maintenance.status.${status}`)}</option>)}
              </select>
              <div className="grid gap-3 md:grid-cols-2">
                <input type="date" value={maintenanceDraft.serviceDate} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, serviceDate: event.target.value }))} className="field-input" />
                <input type="date" value={maintenanceDraft.completedAt} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, completedAt: event.target.value }))} className="field-input" />
                <input type="number" step="0.01" value={maintenanceDraft.cost} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, cost: event.target.value }))} placeholder={t("vehicleDetails.maintenance.fields.cost")} className="field-input" />
                <input value={maintenanceDraft.vendor} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, vendor: event.target.value }))} placeholder={t("vehicleDetails.maintenance.fields.vendor")} className="field-input" />
                <input type="number" value={maintenanceDraft.mileage} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, mileage: event.target.value }))} placeholder={t("vehicleDetails.maintenance.fields.mileage")} className="field-input" />
                <input type="date" value={maintenanceDraft.reminderDate} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, reminderDate: event.target.value }))} className="field-input" />
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={!canEdit || submitting || isArchived} className="app-btn-primary">{editingMaintenanceId ? t("form.saveChanges") : t("vehicleDetails.maintenance.createAction")}</button>
                {editingMaintenanceId ? <button type="button" onClick={() => { setEditingMaintenanceId(null); setMaintenanceDraft(emptyMaintenance); }} className="app-btn-secondary">{t("common.cancel")}</button> : null}
              </div>
            </form>
          </article>
        </section>
      ) : null}

      {activeTab === "documents" ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_400px]">
          <article className="shell-panel p-5 sm:p-6">
            <div className="space-y-4">
              {activeDocuments.length === 0 ? (
                <EmptyState title={t("vehicleDetails.documentsEmptyTitle")} description={t("vehicleDetails.documentsEmptyDescription")} />
              ) : activeDocuments.map((document) => (
                <div key={document.id} className="shell-muted px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{document.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{document.originalName}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge label={t(`vehicleDetails.documents.types.${document.documentType}`)} tone="blue" />
                      {document.expiryDate ? <StatusBadge label={formatDate(document.expiryDate)} tone="yellow" /> : null}
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{formatFileSize(document.sizeBytes)} / {document.uploadedBy?.email ?? "-"}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void openDocument(document)} className="app-btn-secondary">{t("vehicleDetails.documents.openAction")}</button>
                    {canEdit ? <button type="button" onClick={() => void handleDeleteDocument(document)} className="app-btn-ghost">{t("common.archive")}</button> : null}
                  </div>
                </div>
              ))}

              {archivedDocuments.length > 0 ? (
                <div className="space-y-3 pt-2">
                  <p className="text-sm font-semibold text-slate-900">{t("vehicleDetails.documents.archivedTitle")}</p>
                  {archivedDocuments.map((document) => (
                    <div key={document.id} className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-base font-semibold text-slate-950">{document.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{document.originalName}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge label={t("vehicleDetails.documents.archivedBadge")} tone="slate" />
                          <StatusBadge label={t(`vehicleDetails.documents.types.${document.documentType}`)} tone="blue" />
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">{formatFileSize(document.sizeBytes)} / {document.uploadedBy?.email ?? "-"}</p>
                      {document.archiveReason ? <p className="mt-2 text-sm text-slate-600">{document.archiveReason}</p> : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void openDocument(document)} className="app-btn-secondary">{t("vehicleDetails.documents.openAction")}</button>
                        {canEdit ? <button type="button" onClick={() => void handleRestoreDocument(document)} className="app-btn-secondary">{t("common.restore")}</button> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <form className="space-y-4" onSubmit={handleUploadDocument}>
              <input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder={t("vehicleDetails.documents.fields.title")} className="field-input" required />
              <select value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)} className="field-input">
                {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{t(`vehicleDetails.documents.types.${type}`)}</option>)}
              </select>
              <input type="date" value={documentExpiry} onChange={(event) => setDocumentExpiry(event.target.value)} className="field-input" />
              <input type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} className="field-input" required />
              <button type="submit" disabled={!canEdit || submitting || isArchived} className="app-btn-primary w-full">{t("vehicleDetails.documents.uploadAction")}</button>
            </form>
          </article>
        </section>
      ) : null}
    </div>
  );
};

export default VehicleDetailsPage;
