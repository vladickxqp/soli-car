import { AuthUser, UserRole } from "./types";

const ROLE_LEVEL: Record<UserRole, number> = {
  VIEWER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

export const hasRole = (role: UserRole | null | undefined, minimumRole: UserRole) =>
  Boolean(role && ROLE_LEVEL[role] >= ROLE_LEVEL[minimumRole]);

export const isAdmin = (role: UserRole | null | undefined) => role === "ADMIN";
export const isPlatformAdmin = (user: Pick<AuthUser, "role" | "isPlatformAdmin"> | null | undefined) =>
  Boolean(user?.role === "ADMIN" && user.isPlatformAdmin);
export const canManageVehicles = (role: UserRole | null | undefined) => hasRole(role, "MANAGER");
export const canTransferVehicles = (user: Pick<AuthUser, "role" | "isPlatformAdmin"> | null | undefined) =>
  isPlatformAdmin(user);
export const canManageCompanies = (user: Pick<AuthUser, "role"> | null | undefined) => user?.role === "ADMIN";
export const canSelectCompanyScope = (user: Pick<AuthUser, "role" | "isPlatformAdmin"> | null | undefined) =>
  isPlatformAdmin(user);
export const canManageBilling = (user: Pick<AuthUser, "role"> | null | undefined) => user?.role === "ADMIN";
export const canAssignVehicleCompany = (user: Pick<AuthUser, "role" | "isPlatformAdmin"> | null | undefined) =>
  isPlatformAdmin(user);
export const canUpdateVehicleLocation = (role: UserRole | null | undefined) => hasRole(role, "MANAGER");
