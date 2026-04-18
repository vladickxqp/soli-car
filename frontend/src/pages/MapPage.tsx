import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { fetchCompanies, fetchVehicleLocations, updateVehicleLocation } from "../api";
import EmptyState from "../components/EmptyState";
import LoadingCard from "../components/LoadingCard";
import StatusBadge from "../components/StatusBadge";
import { getErrorMessage } from "../errors";
import { formatDateTime, formatNumber } from "../formatters";
import { canSelectCompanyScope, canUpdateVehicleLocation } from "../permissions";
import { useAuthStore } from "../store";
import { Company, VehicleLocationItem, VehicleStatus } from "../types";

const defaultCenter: [number, number] = [51.1657, 10.4515];

const createMarkerIcon = (active: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="
      width: ${active ? 18 : 14}px;
      height: ${active ? 18 : 14}px;
      border-radius: 999px;
      background: ${active ? "#0f172a" : "#0f766e"};
      border: 3px solid rgba(255,255,255,0.92);
      box-shadow: 0 12px 28px rgba(15,23,42,0.28);
    "></div>`,
    iconSize: [active ? 18 : 14, active ? 18 : 14],
    iconAnchor: [active ? 9 : 7, active ? 9 : 7],
  });

const statusOptions: VehicleStatus[] = [
  "ACTIVE",
  "IN_SERVICE",
  "UNDER_REPAIR",
  "INACTIVE",
  "DAMAGED",
  "IN_LEASING",
  "MAINTENANCE",
  "SOLD",
  "TRANSFERRED",
];

const getRandomOffset = () => (Math.random() - 0.5) * 0.16;

const MapViewportSync = ({ center }: { center: [number, number] }) => {
  const map = useMap();

  useEffect(() => {
    map.flyTo(center, Math.max(map.getZoom(), 6), {
      animate: true,
      duration: 0.65,
    });
  }, [center, map]);

  return null;
};

const MapPage = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  const [vehicles, setVehicles] = useState<VehicleLocationItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canFilterCompanies = canSelectCompanyScope(user);
  const canUpdateLocation = canUpdateVehicleLocation(user?.role);

  useEffect(() => {
    if (!token || !canFilterCompanies) {
      return;
    }

    fetchCompanies(token)
      .then(setCompanies)
      .catch((loadError) => setError(getErrorMessage(loadError, t)));
  }, [canFilterCompanies, t, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const data = await fetchVehicleLocations(token, {
          companyId: companyFilter || undefined,
          search: search.trim() || undefined,
          status: statusFilter || undefined,
        });

        if (cancelled) {
          return;
        }

        setVehicles(data);
        setError("");

        if (!selectedVehicleId || !data.some((vehicle) => vehicle.id === selectedVehicleId)) {
          setSelectedVehicleId(data.find((vehicle) => vehicle.latitude != null && vehicle.longitude != null)?.id ?? data[0]?.id ?? "");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, t));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [companyFilter, search, statusFilter, t, token]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [selectedVehicleId, vehicles],
  );

  const mappableVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.latitude != null && vehicle.longitude != null),
    [vehicles],
  );

  const mapCenter = selectedVehicle?.latitude != null && selectedVehicle?.longitude != null
    ? ([selectedVehicle.latitude, selectedVehicle.longitude] as [number, number])
    : mappableVehicles[0]?.latitude != null && mappableVehicles[0]?.longitude != null
      ? ([mappableVehicles[0].latitude!, mappableVehicles[0].longitude!] as [number, number])
      : defaultCenter;

  useEffect(() => {
    if (!selectedVehicle) {
      setLatitude("");
      setLongitude("");
      return;
    }

    setLatitude(selectedVehicle.latitude != null ? String(selectedVehicle.latitude) : "");
    setLongitude(selectedVehicle.longitude != null ? String(selectedVehicle.longitude) : "");
  }, [selectedVehicle]);

  const handleSaveLocation = async (nextLatitude?: number, nextLongitude?: number) => {
    if (!token || !selectedVehicle || !canUpdateLocation) {
      return;
    }

    const latitudeValue = nextLatitude ?? Number(latitude);
    const longitudeValue = nextLongitude ?? Number(longitude);

    if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) {
      toast.error(t("map.invalidCoordinates"));
      return;
    }

    setSaving(true);

    try {
      const updatedVehicle = await updateVehicleLocation(token, {
        vehicleId: selectedVehicle.id,
        latitude: latitudeValue,
        longitude: longitudeValue,
      });

      setVehicles((current) =>
        current.map((vehicle) =>
          vehicle.id === updatedVehicle.id
            ? {
                ...vehicle,
                latitude: updatedVehicle.latitude ?? null,
                longitude: updatedVehicle.longitude ?? null,
                lastLocationUpdate: updatedVehicle.lastLocationUpdate ?? null,
              }
            : vehicle,
        ),
      );
      setLatitude(String(updatedVehicle.latitude ?? latitudeValue));
      setLongitude(String(updatedVehicle.longitude ?? longitudeValue));
      toast.success(t("map.locationUpdated"));
    } catch (actionError) {
      toast.error(getErrorMessage(actionError, t));
    } finally {
      setSaving(false);
    }
  };

  const handleSimulateLocation = () => {
    const baseLatitude = selectedVehicle?.latitude ?? mapCenter[0];
    const baseLongitude = selectedVehicle?.longitude ?? mapCenter[1];
    const nextLatitude = Number((baseLatitude + getRandomOffset()).toFixed(6));
    const nextLongitude = Number((baseLongitude + getRandomOffset()).toFixed(6));
    setLatitude(String(nextLatitude));
    setLongitude(String(nextLongitude));
    void handleSaveLocation(nextLatitude, nextLongitude);
  };

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="shell-kicker">{t("map.kicker")}</p>
            <h1 className="shell-title mt-3">{t("map.title")}</h1>
            <p className="shell-subtitle">{t("map.subtitle")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("map.searchPlaceholder")}
              className="field-input"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="field-input">
              <option value="">{t("dashboard.allStatuses")}</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
            {canFilterCompanies ? (
              <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className="field-input">
                <option value="">{t("dashboard.allCompanies")}</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(360px,0.95fr)]">
        <article className="shell-panel overflow-hidden p-0">
          {loading ? (
            <div className="p-5 sm:p-6">
              <LoadingCard label={t("map.loading")} />
            </div>
          ) : mappableVehicles.length === 0 ? (
            <div className="p-5 sm:p-6">
              <EmptyState title={t("map.emptyMapTitle")} description={t("map.emptyMapDescription")} />
            </div>
          ) : (
            <MapContainer
              center={mapCenter}
              zoom={6}
              scrollWheelZoom
              className="h-[480px] w-full bg-slate-100"
            >
              <MapViewportSync center={mapCenter} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {mappableVehicles.map((vehicle) => (
                <Marker
                  key={vehicle.id}
                  position={[vehicle.latitude!, vehicle.longitude!]}
                  icon={createMarkerIcon(vehicle.id === selectedVehicleId)}
                  eventHandlers={{
                    click: () => setSelectedVehicleId(vehicle.id),
                  }}
                >
                  <Popup>
                    <div className="min-w-[180px] space-y-2">
                      <p className="text-sm font-semibold text-slate-950">{vehicle.model}</p>
                      <p className="text-xs text-slate-500">{vehicle.plate}</p>
                      <p className="text-xs text-slate-500">{vehicle.company?.name}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </article>

        <div className="space-y-6">
          <article className="shell-panel p-5 sm:p-6">
            <p className="shell-kicker">{t("map.selectedKicker")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("map.selectedTitle")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("map.selectedSubtitle")}</p>

            {!selectedVehicle ? (
              <div className="mt-5">
                <EmptyState title={t("map.emptySelectionTitle")} description={t("map.emptySelectionDescription")} />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="shell-muted p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{selectedVehicle.model}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedVehicle.plate} / {selectedVehicle.company?.name}
                      </p>
                    </div>
                    <StatusBadge status={selectedVehicle.status} />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.driver")}</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{selectedVehicle.driver || "-"}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("vehicle.mileage")}</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{t("units.kilometers", { value: formatNumber(selectedVehicle.mileage) })}</p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm text-slate-500">
                    {selectedVehicle.lastLocationUpdate
                      ? t("map.lastUpdated", { date: formatDateTime(selectedVehicle.lastLocationUpdate) })
                      : t("map.neverUpdated")}
                  </p>
                </div>

                <div className="shell-muted p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t("map.updateKicker")}</p>
                  <p className="mt-2 text-sm text-slate-500">{t("map.updateSubtitle")}</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input
                      value={latitude}
                      onChange={(event) => setLatitude(event.target.value)}
                      disabled={!canUpdateLocation}
                      placeholder={t("map.latitude")}
                      className="field-input disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                    <input
                      value={longitude}
                      onChange={(event) => setLongitude(event.target.value)}
                      disabled={!canUpdateLocation}
                      placeholder={t("map.longitude")}
                      className="field-input disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={!canUpdateLocation || saving}
                      title={!canUpdateLocation ? t("permissions.managerRequired") : undefined}
                      onClick={() => void handleSaveLocation()}
                      className="app-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? t("map.saving") : t("map.saveLocation")}
                    </button>
                    <button
                      type="button"
                      disabled={!canUpdateLocation || saving}
                      title={!canUpdateLocation ? t("permissions.managerRequired") : undefined}
                      onClick={handleSimulateLocation}
                      className="app-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t("map.simulate")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </article>

          <article className="shell-panel p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="shell-kicker">{t("map.listKicker")}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{t("map.listTitle")}</h2>
              </div>
              <div className="app-chip">{vehicles.length}</div>
            </div>

            <div className="mt-5 space-y-3">
              {loading ? (
                <>
                  <LoadingCard label={t("map.loading")} />
                  <LoadingCard label={t("map.loading")} />
                </>
              ) : vehicles.length === 0 ? (
                <EmptyState title={t("map.emptyListTitle")} description={t("map.emptyListDescription")} />
              ) : (
                vehicles.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => setSelectedVehicleId(vehicle.id)}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                      vehicle.id === selectedVehicleId
                        ? "border-slate-900 bg-slate-950 text-white shadow-xl"
                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{vehicle.model}</p>
                        <p className={`mt-1 text-xs ${vehicle.id === selectedVehicleId ? "text-slate-300" : "text-slate-500"}`}>
                          {vehicle.plate} / {vehicle.company?.name}
                        </p>
                      </div>
                      <StatusBadge status={vehicle.status} />
                    </div>
                    <p className={`mt-3 text-xs ${vehicle.id === selectedVehicleId ? "text-slate-300" : "text-slate-500"}`}>
                      {vehicle.latitude != null && vehicle.longitude != null
                        ? `${vehicle.latitude.toFixed(4)}, ${vehicle.longitude.toFixed(4)}`
                        : t("map.noCoordinates")}
                    </p>
                  </button>
                ))
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
};

export default MapPage;
