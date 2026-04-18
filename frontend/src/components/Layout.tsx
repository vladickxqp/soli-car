import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  archiveNotification,
  fetchAnalytics,
  fetchNotificationSummary,
  logoutSession,
  markAllNotificationsRead,
  markNotificationRead,
  searchVehicles,
} from "../api";
import { getErrorMessage } from "../errors";
import { useAuthStore } from "../store";
import NotificationCenterPanel from "./NotificationCenterPanel";
import StatusBadge from "./StatusBadge";
import { GlobalSearchResult, NotificationSummary } from "../types";

const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const VehiclesPage = lazy(() => import("../pages/VehiclesPage"));
const CompaniesPage = lazy(() => import("../pages/CompaniesPage"));
const AnalyticsPage = lazy(() => import("../pages/AnalyticsPage"));
const BillingPage = lazy(() => import("../pages/BillingPage"));
const MapPage = lazy(() => import("../pages/MapPage"));
const RemindersPage = lazy(() => import("../pages/RemindersPage"));
const ActivityPage = lazy(() => import("../pages/ActivityPage"));
const NotificationsPage = lazy(() => import("../pages/NotificationsPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const SupportPage = lazy(() => import("../pages/SupportPage"));
const VehicleFormPage = lazy(() => import("../pages/VehicleFormPage"));
const VehicleDetailsPage = lazy(() => import("../pages/VehicleDetailsPage"));
const HistoryPage = lazy(() => import("../pages/HistoryPage"));

const iconClassName = "h-5 w-5";

const DashboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M4 4h7v7H4zM13 4h7v11h-7zM4 13h7v7H4zM13 17h7v3h-7z" />
  </svg>
);

const VehiclesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M5 16l1.7-5.2A2 2 0 0 1 8.6 9h6.8a2 2 0 0 1 1.9 1.4L19 16" />
    <path d="M4 16h16v3a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path d="M7.5 12h9" />
  </svg>
);

const CompaniesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M4 20V8l8-4 8 4v12" />
    <path d="M9 20v-5h6v5M9 10h.01M15 10h.01" />
  </svg>
);

const AnalyticsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M4 20h16" />
    <path d="M7 16v-5M12 16V8M17 16v-8" />
  </svg>
);

const BillingIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M4 7.5h16v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
    <path d="M4 10.5h16" />
    <path d="M8 15h3" />
  </svg>
);

const MapIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z" />
    <path d="M9 4v14M15 6v14" />
    <path d="M12 12.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);

const ReminderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M6 8a6 6 0 1 1 12 0v4.2l1.4 2.8a1 1 0 0 1-.9 1.5H5.5a1 1 0 0 1-.9-1.5L6 12.2z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);

const ActivityIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M4 12h4l2-5 4 10 2-5h4" />
    <path d="M4 5h16M4 19h16" />
  </svg>
);

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" />
  </svg>
);

const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}>
    <path d="M6 9a6 6 0 1 1 12 0v4.2l1.4 2.8a1 1 0 0 1-.9 1.5H5.5a1 1 0 0 1-.9-1.5L6 13.2z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

const emptyNotificationSummary: NotificationSummary = {
  unreadCount: 0,
  highPriorityUnreadCount: 0,
  items: [],
};

const ContentRouteFallback = () => (
  <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-10 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)]">
    <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200" />
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-[22px] bg-slate-100" />
      ))}
    </div>
  </div>
);

const Layout = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummary>(emptyNotificationSummary);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  const navItems = useMemo(
    () => [
      {
        label: t("nav.dashboard"),
        description: t("layout.sections.dashboard"),
        path: "/",
        icon: <DashboardIcon />,
      },
      {
        label: t("nav.vehicles"),
        description: t("layout.sections.vehicles"),
        path: "/vehicles",
        icon: <VehiclesIcon />,
      },
      {
        label: t("nav.companies"),
        description: t("layout.sections.companies"),
        path: "/companies",
        icon: <CompaniesIcon />,
      },
      {
        label: t("nav.analytics"),
        description: t("layout.sections.analytics"),
        path: "/analytics",
        icon: <AnalyticsIcon />,
      },
      {
        label: t("nav.billing"),
        description: t("layout.sections.billing"),
        path: "/billing",
        icon: <BillingIcon />,
      },
      {
        label: t("nav.map"),
        description: t("layout.sections.map"),
        path: "/map",
        icon: <MapIcon />,
      },
      {
        label: t("nav.reminders"),
        description: t("layout.sections.reminders"),
        path: "/reminders",
        icon: <ReminderIcon />,
      },
      {
        label: t("nav.activity"),
        description: t("layout.sections.activity"),
        path: "/activity",
        icon: <ActivityIcon />,
      },
      {
        label: t("nav.settings"),
        description: t("layout.sections.settings"),
        path: "/settings",
        icon: <SettingsIcon />,
      },
    ],
    [t],
  );

  const roleLabel = user?.role ? t(`roles.${user.role}`) : t("common.loading");

  const currentSection = useMemo(() => {
    const match =
      navItems.find((item) =>
        item.path === "/"
          ? location.pathname === "/"
          : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`),
      ) ?? navItems[0];

    if (location.pathname.endsWith("/history")) {
      return {
        label: t("history.title"),
        description: t("history.subtitle"),
      };
    }

    if (location.pathname.startsWith("/support")) {
      return {
        label: t("support.title"),
        description: t("support.subtitle"),
      };
    }

    if (location.pathname.startsWith("/notifications")) {
      return {
        label: t("notificationsCenter.pageTitle"),
        description: t("notificationsCenter.pageSubtitle"),
      };
    }

    if (location.pathname.startsWith("/activity")) {
      return {
        label: t("activity.pageTitle"),
        description: t("activity.pageSubtitle"),
      };
    }

    if (location.pathname.startsWith("/vehicles/") && !location.pathname.endsWith("/edit")) {
      return {
        label: t("vehicleDetails.overview"),
        description: t("layout.sectionDescriptions.vehicleDetails"),
      };
    }

    if (location.pathname.endsWith("/edit") || location.pathname === "/new") {
      return {
        label: location.pathname === "/new" ? t("form.createTitle") : t("form.editTitle"),
        description: t("layout.sectionDescriptions.vehicleForm"),
      };
    }

    return {
      label: match.label,
      description: match.description,
    };
  }, [location.pathname, navItems, t]);

  useEffect(() => {
    setSidebarOpen(false);
    setProfileOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    Promise.all([fetchAnalytics(token), fetchNotificationSummary(token)])
      .then(([summary, notifications]) => {
        if (!cancelled) {
          setAlertCount(summary.notifications.length);
          setNotificationSummary(notifications);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAlertCount(0);
          setNotificationSummary(emptyNotificationSummary);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, token]);

  useEffect(() => {
    if (!token || query.trim().length < 2) {
      setResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchOpen(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const data = await searchVehicles(token, query.trim());
        if (!cancelled) {
          setResults(data);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(getErrorMessage(error, t));
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [query, t, token]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideDesktopSearch = searchContainerRef.current?.contains(target);
      const insideMobileSearch = mobileSearchRef.current?.contains(target);

      if (!insideDesktopSearch && !insideMobileSearch) {
        setSearchOpen(false);
      }

      if (!notificationsRef.current?.contains(target)) {
        setNotificationsOpen(false);
      }

      if (!profileRef.current?.contains(target)) {
        setProfileOpen(false);
      }
    };

    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }

      if (event.key === "Escape") {
        setSearchOpen(false);
        setProfileOpen(false);
        setSidebarOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleShortcut);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  const openVehicle = (vehicleId: string) => {
    navigate(`/vehicles/${vehicleId}`);
    setQuery("");
    setResults([]);
    setSearchOpen(false);
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await logoutSession(token);
      }
    } catch {
      // We still clear local auth state so the user can exit safely.
    } finally {
      logout();
      toast.success(t("auth.loggedOut"));
      navigate("/login");
    }
  };

  const loadNotificationSummary = async () => {
    if (!token) {
      return;
    }

    setNotificationsLoading(true);
    try {
      const summary = await fetchNotificationSummary(token);
      setNotificationSummary(summary);
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    if (!token) {
      return;
    }

    try {
      await markNotificationRead(token, notificationId);
      await loadNotificationSummary();
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    }
  };

  const handleArchiveNotification = async (notificationId: string) => {
    if (!token) {
      return;
    }

    try {
      await archiveNotification(token, notificationId);
      toast.success(t("notificationsCenter.archived"));
      await loadNotificationSummary();
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!token) {
      return;
    }

    try {
      await markAllNotificationsRead(token);
      toast.success(t("notificationsCenter.readAllDone"));
      await loadNotificationSummary();
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    }
  };

  const renderSearchResults = (className = "top-[calc(100%+12px)]") => {
    if (!searchOpen) {
      return null;
    }

    return (
      <div
        id="global-search-results"
        className={`app-popover absolute left-0 right-0 z-20 overflow-hidden rounded-[26px] ${className}`}
      >
        {query.trim().length < 2 ? (
          <div className="px-4 py-5 text-sm text-slate-500">{t("search.hint")}</div>
        ) : searchLoading ? (
          <div className="px-4 py-5 text-sm text-slate-500">{t("search.loading")}</div>
        ) : results.length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-500">{t("search.noResults")}</div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto p-3">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => openVehicle(result.id)}
                className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">
                    {result.model} / {result.plate}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {t("vehicle.vin")} {result.vin} / {result.driver} / {result.company.name}
                  </div>
                </div>
                <StatusBadge status={result.status} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen xl:grid xl:grid-cols-[280px_minmax(0,1fr)]">
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm xl:hidden" onClick={() => setSidebarOpen(false)}></div>
      ) : null}

      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-50 w-[280px] px-5 py-6 transition-transform xl:static xl:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link to="/" className="app-sidebar-brand text-2xl font-semibold tracking-tight">
              Soli Car
            </Link>
            <p className="mt-2 text-sm text-slate-500">{t("layout.subtitle")}</p>
          </div>
          <div className="app-chip xl:hidden">{alertCount}</div>
        </div>

        <nav className="mt-8 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `app-sidebar-link group flex items-center gap-3 rounded-[22px] px-4 py-3 transition ${
                  isActive ? "app-sidebar-link-active" : "app-sidebar-link-inactive"
                }`
              }
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block truncate text-xs text-current/70">{item.description}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-8 shell-muted p-4">
          <p className="shell-kicker">{t("layout.workspaceKicker")}</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{user?.email}</p>
          <p className="mt-1 text-xs text-slate-500">{user?.companyName}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge label={roleLabel} tone="blue" />
            <StatusBadge
              label={user?.emailVerifiedAt ? t("settings.profile.emailVerified") : t("settings.profile.emailPending")}
              tone={user?.emailVerifiedAt ? "green" : "yellow"}
            />
            <span className="app-chip">{t("layout.alertCount", { count: alertCount })}</span>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="app-topbar sticky top-0 z-30">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-6 xl:px-8">
            <button type="button" onClick={() => setSidebarOpen(true)} className="app-btn-secondary xl:hidden">
              <span className="sr-only">{t("common.openNavigation")}</span>
              <MenuIcon />
            </button>

            <div className="min-w-0 flex-1">
              <p className="shell-kicker">{t("layout.activeSection")}</p>
              <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950">{currentSection.label}</h1>
              <p className="mt-1 hidden truncate text-sm text-slate-500 sm:block">{currentSection.description}</p>
            </div>

            <div ref={searchContainerRef} className="relative hidden min-w-[320px] flex-1 lg:block lg:max-w-[460px]">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <SearchIcon />
                </span>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  placeholder={t("search.placeholder")}
                  aria-label={t("search.placeholder")}
                  aria-expanded={searchOpen}
                  aria-controls="global-search-results"
                  className="field-input pl-11 pr-24"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {t("search.shortcut")}
                </span>
              </div>
              {renderSearchResults()}
            </div>

            <Link to="/analytics" className="app-btn-secondary hidden xl:inline-flex">
              {t("layout.alertCount", { count: alertCount })}
            </Link>

            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((current) => !current);
                  if (!notificationsOpen) {
                    void loadNotificationSummary();
                  }
                }}
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
                className="app-btn-secondary relative"
              >
                <span className="sr-only">{t("notificationsCenter.title")}</span>
                <BellIcon />
                {notificationSummary.unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">
                    {notificationSummary.unreadCount > 99 ? "99+" : notificationSummary.unreadCount}
                  </span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <div className="absolute right-0 top-[calc(100%+12px)] z-30">
                  <NotificationCenterPanel
                    notifications={notificationSummary.items}
                    unreadCount={notificationSummary.unreadCount}
                    loading={notificationsLoading}
                    onMarkRead={(notificationId) => void handleMarkNotificationRead(notificationId)}
                    onArchive={(notificationId) => void handleArchiveNotification(notificationId)}
                    onMarkAllRead={() => void handleMarkAllNotificationsRead()}
                  />
                </div>
              ) : null}
            </div>

            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((current) => !current)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-controls="profile-menu"
                className="app-profile-trigger"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
                  {user?.email?.slice(0, 1).toUpperCase()}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="max-w-[180px] truncate text-sm font-semibold text-slate-900">{user?.email}</p>
                  <p className="text-xs text-slate-500">
                    {roleLabel}
                    {user?.companyName ? ` · ${user.companyName}` : ""}
                  </p>
                </div>
              </button>

              {profileOpen ? (
                <div id="profile-menu" role="menu" className="app-popover absolute right-0 top-[calc(100%+12px)] w-[280px] overflow-hidden rounded-[24px]">
                  <div className="border-b border-slate-200 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">{user?.email}</p>
                    <p className="mt-1 text-xs text-slate-500">{user?.companyName}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusBadge label={roleLabel} tone="blue" />
                      <StatusBadge
                        label={user?.emailVerifiedAt ? t("settings.profile.emailVerified") : t("settings.profile.emailPending")}
                        tone={user?.emailVerifiedAt ? "green" : "yellow"}
                      />
                    </div>
                  </div>
                  <div className="p-3">
                    <Link to="/support" role="menuitem" className="flex rounded-2xl px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                      {t("settings.support.action")}
                    </Link>
                    <Link to="/billing" role="menuitem" className="flex rounded-2xl px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                      {t("nav.billing")}
                    </Link>
                    <Link to="/settings" role="menuitem" className="flex rounded-2xl px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                      {t("nav.settings")}
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      role="menuitem"
                      className="mt-1 flex w-full rounded-2xl px-3 py-3 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                    >
                      {t("nav.logout")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 xl:px-8">
          <div className="lg:hidden">
            <div ref={mobileSearchRef} className="relative mb-4">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <SearchIcon />
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  placeholder={t("search.placeholder")}
                  aria-label={t("search.placeholder")}
                  aria-expanded={searchOpen}
                  aria-controls="global-search-results"
                  className="field-input pl-11"
                />
              </div>
              {renderSearchResults("top-[calc(100%+10px)]")}
            </div>
          </div>

          <Suspense fallback={<ContentRouteFallback />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/vehicles" element={<VehiclesPage />} />
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/reminders" element={<RemindersPage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/new" element={<VehicleFormPage />} />
              <Route path="/vehicles/:id" element={<VehicleDetailsPage />} />
              <Route path="/vehicles/:id/edit" element={<VehicleFormPage />} />
              <Route path="/vehicles/:id/history" element={<HistoryPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default Layout;
