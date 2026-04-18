import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY, VEHICLE_VIEW_STORAGE_KEY } from "../preferences";
import { useAuthStore } from "../store";
import SettingsPage from "./SettingsPage";

const changeOwnPassword = vi.fn();
const fetchSessions = vi.fn();
const revokeSession = vi.fn();
const resendVerificationEmail = vi.fn();
const logoutSession = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("../api", () => ({
  changeOwnPassword: (...args: unknown[]) => changeOwnPassword(...args),
  fetchSessions: (...args: unknown[]) => fetchSessions(...args),
  revokeSession: (...args: unknown[]) => revokeSession(...args),
  resendVerificationEmail: (...args: unknown[]) => resendVerificationEmail(...args),
  logoutSession: (...args: unknown[]) => logoutSession(...args),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe("SettingsPage", () => {
  beforeEach(async () => {
    changeOwnPassword.mockReset();
    fetchSessions.mockReset();
    revokeSession.mockReset();
    resendVerificationEmail.mockReset();
    logoutSession.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    fetchSessions.mockResolvedValue([]);
    useAuthStore.setState({
      token: "token-123",
      user: {
        id: "user-1",
        email: "manager@solicar.com",
        role: "MANAGER",
        companyId: "company-1",
        companyName: "Fleet Partners",
        isPlatformAdmin: false,
        registrationType: "COMPANY",
        emailVerifiedAt: "2026-04-18T09:00:00.000Z",
        onboardingCompletedAt: "2026-04-18T09:30:00.000Z",
        sessionId: "session-1",
      },
    });
    await i18n.changeLanguage("en");
  });

  it("persists theme, vehicle view and language preferences from settings", async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    fireEvent.change(screen.getByLabelText("Multilingual experience"), {
      target: { value: "de" },
    });

    await waitFor(() => {
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(localStorage.getItem(VEHICLE_VIEW_STORAGE_KEY)).toBe("cards");
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("de");
    });
  });

  it("submits the change password flow with the authenticated token", async () => {
    changeOwnPassword.mockResolvedValue({ success: true });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "OldPass123!" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "NewPass123!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "NewPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(changeOwnPassword).toHaveBeenCalledWith("token-123", {
        currentPassword: "OldPass123!",
        newPassword: "NewPass123!",
      });
      expect(toastSuccess).toHaveBeenCalled();
    });
  });
});
