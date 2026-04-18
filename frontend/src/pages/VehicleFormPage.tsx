import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  createVehicle,
  fetchCompanies,
  fetchVehicle,
  resolveAssetUrl,
  updateVehicle,
  uploadImage,
} from "../api";
import LoadingCard from "../components/LoadingCard";
import { getErrorMessage } from "../errors";
import { getCurrentDateInputValue } from "../formatters";
import { canAssignVehicleCompany, canManageVehicles } from "../permissions";
import { useAuthStore } from "../store";
import {
  Company,
  VehicleDamageStatus,
  VehicleIncidentPayload,
  VehicleIncidentStatus,
  VehiclePayload,
  VehicleStatus,
} from "../types";

const today = getCurrentDateInputValue();
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
const DAMAGE_STATUS_OPTIONS: VehicleDamageStatus[] = ["NONE", "REPORTED", "UNDER_REPAIR", "REPAIRED"];
const INCIDENT_STATUS_OPTIONS: VehicleIncidentStatus[] = ["UNRESOLVED", "REPAIRED"];

const createEmptyIncident = (): VehicleIncidentPayload => ({
  title: "",
  description: "",
  status: "UNRESOLVED",
  occurredAt: today,
  repairedAt: "",
  repairNotes: "",
});

const initialPayload: VehiclePayload = {
  model: "",
  firstRegistration: today,
  vin: "",
  hsn: "",
  tsn: "",
  price: "0",
  tuvDate: today,
  tireStorage: "",
  plate: "",
  lastUpdate: today,
  driver: "",
  contractType: "",
  contractValue: "0",
  interest: "0",
  contractStart: today,
  contractEnd: today,
  leasingPartner: "",
  customerNumber: "",
  inventoryNumber: "",
  contractPartner: "",
  billingFrom: today,
  leasingRate: "0",
  billedTo: today,
  insurancePartner: "",
  insuranceNumber: "",
  insuranceCost: "0",
  insuranceStart: today,
  insuranceEnd: today,
  mileage: 0,
  yearlyMileage: 0,
  taxPerYear: "0",
  paymentDate: today,
  status: "ACTIVE",
  hadPreviousAccidents: false,
  damageStatus: "NONE",
  damageNotes: "",
  incidents: [],
  imageUrl: "",
  companyId: "",
};

const numberFields = new Set(["mileage", "yearlyMileage"]);

const VehicleFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [payload, setPayload] = useState<VehiclePayload>(initialPayload);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canEdit = canManageVehicles(user?.role);
  const canAssignCompany = canAssignVehicleCompany(user) && !id;
  const roleLabel = user?.role ? t(`roles.${user.role}`) : t("common.loading");

  const statusOptions = useMemo(() => {
    if (payload.status === "TRANSFERRED") {
      return ["TRANSFERRED", ...EDITABLE_STATUS_OPTIONS] as VehicleStatus[];
    }

    return EDITABLE_STATUS_OPTIONS;
  }, [payload.status]);

  useEffect(() => {
    if (!token || !canAssignVehicleCompany(user)) return;

    let cancelled = false;
    fetchCompanies(token)
      .then((companyData) => {
        if (!cancelled) {
          setCompanies(companyData);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(getErrorMessage(loadError, t));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [t, token, user]);

  useEffect(() => {
    if (!token || !id) return;

    let cancelled = false;
    setLoading(true);
    fetchVehicle(token, id)
      .then((vehicle) => {
        if (cancelled) return;

        setPayload({
          model: vehicle.model,
          firstRegistration: vehicle.firstRegistration.slice(0, 10),
          vin: vehicle.vin,
          hsn: vehicle.hsn,
          tsn: vehicle.tsn,
          price: String(vehicle.price),
          tuvDate: vehicle.tuvDate.slice(0, 10),
          tireStorage: vehicle.tireStorage,
          plate: vehicle.plate,
          lastUpdate: vehicle.lastUpdate.slice(0, 10),
          driver: vehicle.driver,
          contractType: vehicle.contractType,
          contractValue: String(vehicle.contractValue),
          interest: String(vehicle.interest),
          contractStart: vehicle.contractStart.slice(0, 10),
          contractEnd: vehicle.contractEnd.slice(0, 10),
          leasingPartner: vehicle.leasingPartner,
          customerNumber: vehicle.customerNumber,
          inventoryNumber: vehicle.inventoryNumber,
          contractPartner: vehicle.contractPartner,
          billingFrom: vehicle.billingFrom.slice(0, 10),
          leasingRate: String(vehicle.leasingRate),
          billedTo: vehicle.billedTo.slice(0, 10),
          insurancePartner: vehicle.insurancePartner,
          insuranceNumber: vehicle.insuranceNumber,
          insuranceCost: String(vehicle.insuranceCost),
          insuranceStart: vehicle.insuranceStart.slice(0, 10),
          insuranceEnd: vehicle.insuranceEnd.slice(0, 10),
          mileage: vehicle.mileage,
          yearlyMileage: vehicle.yearlyMileage,
          taxPerYear: String(vehicle.taxPerYear),
          paymentDate: vehicle.paymentDate.slice(0, 10),
          status: vehicle.status,
          hadPreviousAccidents: vehicle.hadPreviousAccidents,
          damageStatus: vehicle.damageStatus,
          damageNotes: vehicle.damageNotes ?? "",
          incidents: vehicle.incidents.map((incident) => ({
            id: incident.id,
            title: incident.title,
            description: incident.description,
            status: incident.status,
            occurredAt: incident.occurredAt.slice(0, 10),
            repairedAt: incident.repairedAt ? incident.repairedAt.slice(0, 10) : "",
            repairNotes: incident.repairNotes ?? "",
          })),
          imageUrl: vehicle.imageUrl ?? "",
          companyId: vehicle.companyId,
        });
        setError("");
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
  }, [id, t, token]);

  const handleChange = (field: keyof VehiclePayload, value: string) => {
    setPayload((current) => ({
      ...current,
      [field]: numberFields.has(field) ? Number(value) : value,
    }));
  };

  const handleBooleanChange = (field: keyof VehiclePayload, value: boolean) => {
    setPayload((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleIncidentChange = (
    index: number,
    field: keyof VehicleIncidentPayload,
    value: string,
  ) => {
    setPayload((current) => ({
      ...current,
      incidents: current.incidents.map((incident, incidentIndex) => {
        if (incidentIndex !== index) {
          return incident;
        }

        if (field === "status" && value === "UNRESOLVED") {
          return {
            ...incident,
            status: value,
            repairedAt: "",
            repairNotes: "",
          };
        }

        return {
          ...incident,
          [field]: value,
        };
      }),
    }));
  };

  const handleAddIncident = () => {
    setPayload((current) => ({
      ...current,
      hadPreviousAccidents: true,
      damageStatus: current.damageStatus === "NONE" ? "REPORTED" : current.damageStatus,
      incidents: [...current.incidents, createEmptyIncident()],
    }));
  };

  const handleRemoveIncident = (index: number) => {
    setPayload((current) => ({
      ...current,
      incidents: current.incidents.filter((_, incidentIndex) => incidentIndex !== index),
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    if (payload.incidents.length > 0 && payload.damageStatus === "NONE") {
      toast.error(t("form.incidentValidation.damageStatusRequired"));
      return;
    }

    if (
      payload.incidents.some(
        (incident) => incident.status === "REPAIRED" && !incident.repairedAt,
      )
    ) {
      toast.error(t("form.incidentValidation.repairedDateRequired"));
      return;
    }

    setSaving(true);
    try {
      let imageUrl = payload.imageUrl;

      if (imageFile) {
        const uploadResult = await uploadImage(token, imageFile);
        imageUrl = uploadResult.imageUrl;
      }

      const finalPayload: VehiclePayload = {
        ...payload,
        imageUrl,
      };

      if (id) {
        await updateVehicle(token, id, finalPayload);
        toast.success(t("messages.vehicleSaved"));
        navigate(`/vehicles/${id}`);
      } else {
        const created = await createVehicle(token, finalPayload);
        toast.success(t("messages.vehicleCreated"));
        navigate(`/vehicles/${created.id}`);
      }
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, t));
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-6 py-6 text-sm text-amber-800">
        <p className="font-semibold">{t("permissions.readOnlyTitle")}</p>
        <p className="mt-2">{t("permissions.readOnlyDescription")}</p>
        <Link to="/" className="mt-4 inline-flex rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  if (loading) {
    return <LoadingCard label={t("form.loading")} />;
  }

  const sections = [
    {
      title: t("form.sections.general"),
      fields: [
        { key: "model", type: "text" },
        { key: "plate", type: "text" },
        { key: "vin", type: "text" },
        { key: "hsn", type: "text" },
        { key: "tsn", type: "text" },
        { key: "price", type: "number" },
        { key: "firstRegistration", type: "date" },
        { key: "tuvDate", type: "date" },
        { key: "lastUpdate", type: "date" },
        { key: "driver", type: "text" },
        { key: "tireStorage", type: "text" },
      ],
    },
    {
      title: t("form.sections.contract"),
      fields: [
        { key: "contractType", type: "text" },
        { key: "contractValue", type: "number" },
        { key: "interest", type: "number" },
        { key: "contractStart", type: "date" },
        { key: "contractEnd", type: "date" },
        { key: "leasingPartner", type: "text" },
        { key: "customerNumber", type: "text" },
        { key: "inventoryNumber", type: "text" },
        { key: "contractPartner", type: "text" },
        { key: "billingFrom", type: "date" },
        { key: "leasingRate", type: "number" },
        { key: "billedTo", type: "date" },
      ],
    },
    {
      title: t("form.sections.insurance"),
      fields: [
        { key: "insurancePartner", type: "text" },
        { key: "insuranceNumber", type: "text" },
        { key: "insuranceCost", type: "number" },
        { key: "insuranceStart", type: "date" },
        { key: "insuranceEnd", type: "date" },
        { key: "mileage", type: "number" },
        { key: "yearlyMileage", type: "number" },
        { key: "taxPerYear", type: "number" },
        { key: "paymentDate", type: "date" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="shell-kicker">{t("form.kicker")}</p>
            <h2 className="shell-title mt-3">
              {id ? t("form.editTitle") : t("form.createTitle")}
            </h2>
            <p className="shell-subtitle">{t("form.subtitle")}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="app-chip">{roleLabel}</span>
              <span className="app-chip">{id ? t("form.editTitle") : t("form.createTitle")}</span>
            </div>
          </div>

          {payload.imageUrl ? (
            <img
              src={resolveAssetUrl(payload.imageUrl)}
              alt={payload.model || t("nav.newVehicle")}
              className="h-24 w-24 rounded-[24px] object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-[24px] bg-slate-950 text-2xl font-semibold text-white">
              {(payload.model || "SC").slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <form className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.78fr)]" onSubmit={handleSubmit}>
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="shell-panel p-6">
              <h3 className="text-lg font-semibold text-slate-950">{section.title}</h3>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.fields.map((field) => (
                  <label key={field.key} className="block text-sm font-medium text-slate-700">
                    {t(`vehicle.${field.key}`)}
                    <input
                      type={field.type}
                      value={String(payload[field.key as keyof VehiclePayload] ?? "")}
                      onChange={(event) => handleChange(field.key as keyof VehiclePayload, event.target.value)}
                      className="field-input mt-2"
                      required={field.key !== "tireStorage"}
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}

          <section className="shell-panel p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="shell-kicker">{t("form.sections.incidents")}</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">{t("vehicle.damageStatus")}</h3>
                <p className="mt-2 text-sm text-slate-500">{t("form.incidentsSubtitle")}</p>
              </div>
              <button type="button" onClick={handleAddIncident} className="app-btn-secondary">
                {t("form.addIncident")}
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={payload.hadPreviousAccidents}
                    onChange={(event) => handleBooleanChange("hadPreviousAccidents", event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-300"
                  />
                  <span>{t("vehicle.hadPreviousAccidents")}</span>
                </span>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                {t("vehicle.damageStatus")}
                <select
                  value={payload.damageStatus}
                  onChange={(event) => handleChange("damageStatus", event.target.value)}
                  className="field-input mt-2"
                >
                  {DAMAGE_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {t(`damageStatus.${status}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              {t("vehicle.damageNotes")}
              <textarea
                value={payload.damageNotes ?? ""}
                onChange={(event) => handleChange("damageNotes", event.target.value)}
                rows={4}
                className="field-input mt-2 resize-y"
              />
            </label>

            <div className="mt-6 space-y-4">
              {payload.incidents.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
                  {t("form.noIncidents")}
                </div>
              ) : (
                payload.incidents.map((incident, index) => (
                  <div key={incident.id ?? `new-incident-${index}`} className="shell-muted p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {incident.title || t("form.incidentLabel", { count: index + 1 })}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{t("form.incidentHelp")}</p>
                      </div>
                      <button type="button" onClick={() => handleRemoveIncident(index)} className="app-btn-ghost">
                        {t("common.delete")}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block text-sm font-medium text-slate-700">
                        {t("vehicle.incidentTitle")}
                        <input
                          type="text"
                          value={incident.title}
                          onChange={(event) => handleIncidentChange(index, "title", event.target.value)}
                          className="field-input mt-2"
                          required
                        />
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        {t("vehicle.incidentOccurredAt")}
                        <input
                          type="date"
                          value={incident.occurredAt}
                          onChange={(event) => handleIncidentChange(index, "occurredAt", event.target.value)}
                          className="field-input mt-2"
                          required
                        />
                      </label>

                      <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                        {t("vehicle.incidentDescription")}
                        <textarea
                          value={incident.description}
                          onChange={(event) => handleIncidentChange(index, "description", event.target.value)}
                          rows={4}
                          className="field-input mt-2 resize-y"
                          required
                        />
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        {t("vehicle.incidentStatus")}
                        <select
                          value={incident.status}
                          onChange={(event) => handleIncidentChange(index, "status", event.target.value)}
                          className="field-input mt-2"
                        >
                          {INCIDENT_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {t(`incidentStatus.${status}`)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        {t("vehicle.repairedAt")}
                        <input
                          type="date"
                          value={incident.repairedAt ?? ""}
                          onChange={(event) => handleIncidentChange(index, "repairedAt", event.target.value)}
                          className="field-input mt-2"
                          disabled={incident.status !== "REPAIRED"}
                          required={incident.status === "REPAIRED"}
                        />
                      </label>

                      <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                        {t("vehicle.repairNotes")}
                        <textarea
                          value={incident.repairNotes ?? ""}
                          onChange={(event) => handleIncidentChange(index, "repairNotes", event.target.value)}
                          rows={3}
                          className="field-input mt-2 resize-y"
                          disabled={incident.status !== "REPAIRED"}
                        />
                      </label>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <section className="shell-panel p-6">
            <p className="shell-kicker">{t("form.sections.admin")}</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">{t("vehicle.status")}</h3>
            <p className="mt-2 text-sm text-slate-500">{t("form.subtitle")}</p>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                {t("vehicle.status")}
                <select
                  value={payload.status}
                  onChange={(event) => handleChange("status", event.target.value)}
                  className="field-input mt-2"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {t(`status.${status}`)}
                    </option>
                  ))}
                </select>
              </label>

              {canAssignCompany ? (
                <label className="block text-sm font-medium text-slate-700">
                  {t("vehicle.company")}
                  <select
                    value={payload.companyId}
                    onChange={(event) => handleChange("companyId", event.target.value)}
                    className="field-input mt-2"
                    required
                  >
                    <option value="">{t("form.selectCompany")}</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block text-sm font-medium text-slate-700">
                {t("form.imageUrl")}
                <input
                  type="url"
                  value={payload.imageUrl ?? ""}
                  onChange={(event) => handleChange("imageUrl", event.target.value)}
                  className="field-input mt-2"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                {t("form.uploadImage")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                  className="field-input mt-2"
                />
              </label>
            </div>
          </section>

          <section className="shell-panel p-6">
            <div className="shell-muted flex items-center gap-4 p-4">
              {payload.imageUrl ? (
                <img
                  src={resolveAssetUrl(payload.imageUrl)}
                  alt={payload.model || t("nav.newVehicle")}
                  className="h-20 w-20 rounded-[22px] object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-slate-950 text-xl font-semibold text-white">
                  {(payload.model || "SC").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="shell-kicker">{t("vehicle.model")}</p>
                <p className="mt-2 truncate text-base font-semibold text-slate-950">
                  {payload.model || t("nav.newVehicle")}
                </p>
                <p className="mt-1 truncate text-sm text-slate-500">{payload.plate || payload.vin || "-"}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row xl:flex-col">
              <button type="submit" disabled={saving} className="app-btn-primary justify-center">
                {saving ? t("common.loading") : id ? t("form.saveChanges") : t("form.createVehicle")}
              </button>
              <button
                type="button"
                onClick={() => navigate(id ? `/vehicles/${id}` : "/vehicles")}
                className="app-btn-secondary justify-center"
              >
                {t("common.cancel")}
              </button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
};

export default VehicleFormPage;
