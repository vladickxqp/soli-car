import SkeletonBlock from "./SkeletonBlock";

const LoadingCard = ({ label }: { label: string }) => (
  <div className="shell-panel px-6 py-6">
    <SkeletonBlock className="h-3 w-20" />
    <SkeletonBlock className="mt-5 h-9 w-24" />
    <SkeletonBlock className="mt-3 h-3 w-36" />
    <p className="mt-5 text-sm text-slate-500">{label}</p>
  </div>
);

export default LoadingCard;
