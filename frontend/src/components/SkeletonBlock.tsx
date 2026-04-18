interface SkeletonBlockProps {
  className?: string;
}

const SkeletonBlock = ({ className = "" }: SkeletonBlockProps) => (
  <div className={`animate-pulse rounded-xl bg-slate-200/80 ${className}`}></div>
);

export default SkeletonBlock;
