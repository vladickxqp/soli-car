import { useTranslation } from "react-i18next";
import { VehicleStatus } from "../types";

type Tone = "green" | "blue" | "slate" | "yellow" | "red" | "purple";

interface StatusBadgeProps {
  label?: string;
  status?: VehicleStatus;
  tone?: Tone;
}

const toneClasses: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
  blue: "bg-sky-50 text-sky-700 ring-sky-200/80",
  slate: "bg-slate-100 text-slate-700 ring-slate-200/80",
  yellow: "bg-amber-50 text-amber-700 ring-amber-200/80",
  red: "bg-rose-50 text-rose-700 ring-rose-200/80",
  purple: "bg-violet-50 text-violet-700 ring-violet-200/80",
};

const statusTone: Record<VehicleStatus, Tone> = {
  ACTIVE: "green",
  IN_SERVICE: "blue",
  UNDER_REPAIR: "yellow",
  TRANSFER_PENDING: "purple",
  ARCHIVED: "slate",
  INACTIVE: "slate",
  DISPOSED: "red",
  DAMAGED: "red",
  IN_LEASING: "blue",
  SOLD: "slate",
  MAINTENANCE: "yellow",
  TRANSFERRED: "purple",
};

const StatusBadge = ({ label, status, tone }: StatusBadgeProps) => {
  const { t } = useTranslation();
  const resolvedTone = tone ?? (status ? statusTone[status] : "slate");
  const text = status ? t(`status.${status}`) : label;

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${toneClasses[resolvedTone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70"></span>
      {text}
    </span>
  );
};

export default StatusBadge;
