import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import Layout from "./components/Layout";
import { isPlatformAdmin } from "./permissions";
import { useAuthStore } from "./store";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const PublicVehicleSharePage = lazy(() => import("./pages/PublicVehicleSharePage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminCompaniesPage = lazy(() => import("./pages/admin/AdminCompaniesPage"));
const AdminVehiclesPage = lazy(() => import("./pages/admin/AdminVehiclesPage"));
const AdminTicketsPage = lazy(() => import("./pages/admin/AdminTicketsPage"));
const AdminApprovalsPage = lazy(() => import("./pages/admin/AdminApprovalsPage"));
const AdminLogsPage = lazy(() => import("./pages/admin/AdminLogsPage"));

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center px-6 py-10">
    <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white px-6 py-10 text-center shadow-[0_24px_80px_-48px_rgba(15,23,42,0.35)]">
      <div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-teal-500/20" />
      <p className="mt-4 text-sm font-medium text-slate-600">Loading workspace...</p>
    </div>
  </div>
);

const needsOnboarding = (user: ReturnType<typeof useAuthStore.getState>["user"]) =>
  Boolean(user?.emailVerifiedAt) && !user?.onboardingCompletedAt;

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (needsOnboarding(user)) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
};

const AuthRoute = ({ children }: { children: JSX.Element }) => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  return token ? <Navigate to={needsOnboarding(user) ? "/onboarding" : "/"} replace /> : children;
};

const OnboardingRoute = ({ children }: { children: JSX.Element }) => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return needsOnboarding(user) ? children : <Navigate to="/" replace />;
};

const AdminRoute = ({ children }: { children: JSX.Element }) => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return isPlatformAdmin(user) ? children : <Navigate to="/" replace />;
};

function App() {
  const token = useAuthStore((state) => state.token);

  return (
    <div className="app-shell min-h-screen">
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              token ? (
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              ) : (
                <LandingPage />
              )
            }
          />
          <Route
            path="/login"
            element={
              <AuthRoute>
                <LoginPage />
              </AuthRoute>
            }
          />
          <Route
            path="/register"
            element={
              <AuthRoute>
                <RegisterPage />
              </AuthRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <AuthRoute>
                <ForgotPasswordPage />
              </AuthRoute>
            }
          />
          <Route
            path="/reset-password"
            element={
              <AuthRoute>
                <ResetPasswordPage />
              </AuthRoute>
            }
          />
          <Route
            path="/verify-email"
            element={
              <AuthRoute>
                <VerifyEmailPage />
              </AuthRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <OnboardingRoute>
                <OnboardingPage />
              </OnboardingRoute>
            }
          />
          <Route path="/public/vehicles/:token" element={<PublicVehicleSharePage />} />
          <Route
            path="/admin/*"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="companies" element={<AdminCompaniesPage />} />
            <Route path="vehicles" element={<AdminVehiclesPage />} />
            <Route path="tickets" element={<AdminTicketsPage />} />
            <Route path="approvals" element={<AdminApprovalsPage />} />
            <Route path="logs" element={<AdminLogsPage />} />
          </Route>
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
