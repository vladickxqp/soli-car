import { create } from "zustand";
import { AuthUser, RegistrationType } from "./types";

const AUTH_TOKEN_STORAGE_KEY = "soli-car-token";
const AUTH_USER_STORAGE_KEY = "soli-car-user";

interface UserState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  updateUser: (user: AuthUser) => void;
  logout: () => void;
}

const parseStoredUser = (): AuthUser | null => {
  const rawUser = localStorage.getItem(AUTH_USER_STORAGE_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawUser) as Partial<AuthUser>;
    if (!parsed?.id || !parsed?.email || !parsed?.role || !parsed?.companyId) {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      return null;
    }

    const registrationType: RegistrationType = parsed.registrationType === "INDIVIDUAL" ? "INDIVIDUAL" : "COMPANY";

    return {
      id: parsed.id,
      email: parsed.email,
      role: parsed.role,
      companyId: parsed.companyId,
      companyName: parsed.companyName ?? "",
      isPlatformAdmin: Boolean(parsed.isPlatformAdmin),
      registrationType,
      emailVerifiedAt: parsed.emailVerifiedAt ?? null,
      onboardingCompletedAt: parsed.onboardingCompletedAt ?? null,
      sessionId: parsed.sessionId ?? null,
    };
  } catch {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return null;
  }
};

const initialState = () => {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const user = parseStoredUser();

  return {
    token,
    user,
  };
};

export const useAuthStore = create<UserState>((set) => ({
  ...initialState(),
  setAuth: (token, user) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    set({ token, user });
  },
  updateUser: (user) => {
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    set((state) => ({ token: state.token, user }));
  },
  logout: () => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    set({ token: null, user: null });
  },
}));
