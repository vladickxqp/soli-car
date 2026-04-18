interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div className="shell-muted px-6 py-10 text-center shadow-sm">
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
      <div className="h-6 w-6 rounded-full border-2 border-dashed border-slate-300"></div>
    </div>
    <h3 className="mt-5 text-lg font-semibold text-slate-900">{title}</h3>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);

export default EmptyState;
