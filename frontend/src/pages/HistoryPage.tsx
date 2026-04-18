import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchHistory } from "../api";
import HistoryTimeline from "../components/HistoryTimeline";
import LoadingCard from "../components/LoadingCard";
import { getErrorMessage } from "../errors";
import { useAuthStore } from "../store";
import { VehicleHistory } from "../types";

const HistoryPage = () => {
  const { id } = useParams();
  const token = useAuthStore((state) => state.token);
  const { t } = useTranslation();

  const [history, setHistory] = useState<VehicleHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !id) return;

    setLoading(true);
    fetchHistory(token, id)
      .then((result) => {
        setHistory(result);
        setError("");
      })
      .catch((loadError) => setError(getErrorMessage(loadError, t)))
      .finally(() => setLoading(false));
  }, [id, t, token]);

  return (
    <div className="space-y-6">
      <section className="shell-panel-strong p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="shell-kicker">{t("history.kicker")}</p>
            <h2 className="shell-title mt-3">{t("history.title")}</h2>
            <p className="shell-subtitle">{t("history.subtitle")}</p>
          </div>
          <Link to={`/vehicles/${id}`} className="app-btn-secondary">
            {t("common.back")}
          </Link>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="shell-panel p-6">
        {loading ? <LoadingCard label={t("history.loading")} /> : <HistoryTimeline history={history} />}
      </section>
    </div>
  );
};

export default HistoryPage;
