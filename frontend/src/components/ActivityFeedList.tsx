import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ActivityFeedItem } from "../types";
import { formatDateTime, formatRelativeTime } from "../formatters";
import EmptyState from "./EmptyState";

interface ActivityFeedListProps {
  items: ActivityFeedItem[];
  emptyTitle: string;
  emptyDescription: string;
  compact?: boolean;
}

const ActivityFeedList = ({
  items,
  emptyTitle,
  emptyDescription,
  compact = false,
}: ActivityFeedListProps) => {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const content = (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                  {formatRelativeTime(item.timestamp)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.timestamp)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                {t(`admin.logs.entity.${item.entityType}`, item.entityType)}
              </span>
              <span>{item.actor?.email ?? t("admin.logs.systemActor")}</span>
            </div>
          </>
        );

        const className = compact
          ? "shell-muted block px-4 py-4"
          : "shell-muted block px-4 py-4 sm:px-5";

        return item.link ? (
          <Link key={item.id} to={item.link} className={className}>
            {content}
          </Link>
        ) : (
          <div key={item.id} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
};

export default ActivityFeedList;
