import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { useAuthStore } from "../store";
import { storeVerificationPreview } from "../verificationPreview";
import VerifyEmailPage from "./VerifyEmailPage";

const resendVerificationEmail = vi.fn();
const verifyEmailToken = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("../api", () => ({
  ApiError: class ApiError extends Error {
    code?: string;
    status: number;

    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
    }
  },
  resendVerificationEmail: (...args: unknown[]) => resendVerificationEmail(...args),
  verifyEmailToken: (...args: unknown[]) => verifyEmailToken(...args),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe("VerifyEmailPage", () => {
  beforeEach(async () => {
    resendVerificationEmail.mockReset();
    verifyEmailToken.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    useAuthStore.setState({ token: null, user: null });
    await i18n.changeLanguage("en");
  });

  it("shows the local demo verification preview link when available", () => {
    storeVerificationPreview("preview@solicar.com", "http://localhost:5173/verify-email?token=demo-preview-token");

    render(
      <MemoryRouter initialEntries={["/verify-email?email=preview@solicar.com"]}>
        <VerifyEmailPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Open the verification link directly" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open verification link" })).toHaveAttribute(
      "href",
      "http://localhost:5173/verify-email?token=demo-preview-token",
    );
  });
});
