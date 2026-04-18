import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import Layout from "./components/Layout";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import PublicVehicleSharePage from "./pages/PublicVehicleSharePage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import AdminApprovalsPage from "./pages/admin/AdminApprovalsPage";
import AdminCompaniesPage from "./pages/admin/AdminCompaniesPage";
import AdminLogsPage from "./pages/admin/AdminLogsPage";
import AdminTicketsPage from "./pages/admin/AdminTicketsPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminVehiclesPage from "./pages/admin/AdminVehiclesPage";
import { isPlatformAdmin } from "./permissions";
import { useAuthStore } from "./store";

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
  return (
    <div className="app-shell min-h-screen">
      <Routes>
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
    </div>
  );
}

export default App;
