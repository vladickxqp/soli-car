interface StatCardProps {
  value: number | string;
  label: string;
  accent: string;
}

const StatCard = ({ value, label, accent }: StatCardProps) => (
  <div className="shell-panel p-5">
    <div className="flex items-center justify-between gap-4">
      <div className={`h-11 w-11 rounded-2xl ${accent} shadow-inner`}></div>
      <div className="text-right">
        <div className="text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
        <div className="mt-1 text-sm text-slate-500">{label}</div>
      </div>
    </div>
  </div>
);

export default StatCard;
