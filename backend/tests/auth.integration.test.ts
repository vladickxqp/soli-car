import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./helpers/prismaMock";

vi.mock("../src/utils/prisma.js", () => ({
  default: prismaMock,
}));

const { default: app } = await import("../src/app.js");

describe("auth routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    process.env.JWT_SECRET = "test-secret";
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("registers a company workspace account without granting platform admin access and requires email verification", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.company.create.mockResolvedValue({
      id: "company-1",
      name: "Acme Fleet",
    });
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.subscription.create.mockResolvedValue({
      id: "subscription-1",
      companyId: "company-1",
      plan: "FREE",
      status: "ACTIVE",
    });
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "admin@acme.test",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      emailVerifiedAt: null,
      onboardingCompletedAt: null,
      company: { name: "Acme Fleet" },
    });
    prismaMock.emailVerificationToken.create.mockResolvedValue({
      id: "verification-1",
      userId: "user-1",
    });

    const response = await request(app).post("/auth/register").send({
      email: "admin@acme.test",
      password: "Secret123!",
      companyName: "Acme Fleet",
      registrationType: "COMPANY",
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      success: true,
      requiresEmailVerification: true,
      email: "admin@acme.test",
      deliveryMode: "log",
    });
    expect(response.body.data.previewUrl).toEqual(expect.stringContaining("/verify-email?token="));
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "MANAGER",
          isPlatformAdmin: false,
        }),
      }),
    );
    expect(prismaMock.emailVerificationToken.create).toHaveBeenCalled();
  });

  it("rejects company registration when the workspace name already exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue({
      id: "company-existing-1",
    });

    const response = await request(app).post("/auth/register").send({
      email: "manager@acme.test",
      password: "Secret123!",
      companyName: "Acme Fleet",
      registrationType: "COMPANY",
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("COMPANY_NAME_ALREADY_EXISTS");
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("blocks login before email verification", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-2",
      email: "manager@acme.test",
      password: await bcrypt.hash("Secret123!", 10),
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      emailVerifiedAt: null,
      onboardingCompletedAt: null,
      deletedAt: null,
      company: { name: "Acme Fleet" },
    });

    const response = await request(app).post("/auth/login").send({
      email: "manager@acme.test",
      password: "Secret123!",
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("verifies the account with a valid token and creates a session", async () => {
    prismaMock.emailVerificationToken.findUnique.mockResolvedValue({
      id: "verification-valid",
      userId: "user-verify-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      user: {
        id: "user-verify-1",
        email: "verified@acme.test",
        role: "MANAGER",
        companyId: "company-1",
        isPlatformAdmin: false,
        registrationType: "COMPANY",
        emailVerifiedAt: null,
        onboardingCompletedAt: null,
        deletedAt: null,
        company: { name: "Acme Fleet" },
      },
    });
    prismaMock.emailVerificationToken.update.mockResolvedValue({
      id: "verification-valid",
      usedAt: new Date(),
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-verify-1",
      email: "verified@acme.test",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: null,
      company: { name: "Acme Fleet" },
    });
    prismaMock.userSession.create.mockResolvedValue({ id: "session-verify-1" });

    const response = await request(app).post("/auth/verify-email").send({
      token: "plain-verification-token",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      email: "verified@acme.test",
      companyName: "Acme Fleet",
      sessionId: "session-verify-1",
    });
    expect(response.body.data.token).toEqual(expect.any(String));
  });

  it("rejects expired verification tokens", async () => {
    prismaMock.emailVerificationToken.findUnique.mockResolvedValue({
      id: "verification-expired",
      userId: "user-verify-2",
      usedAt: null,
      expiresAt: new Date(Date.now() - 60 * 1000),
      user: {
        id: "user-verify-2",
        email: "expired@acme.test",
        role: "VIEWER",
        companyId: "company-1",
        isPlatformAdmin: false,
        registrationType: "COMPANY",
        emailVerifiedAt: null,
        onboardingCompletedAt: null,
        deletedAt: null,
        company: { name: "Acme Fleet" },
      },
    });

    const response = await request(app).post("/auth/verify-email").send({
      token: "expired-verification-token",
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("EMAIL_VERIFICATION_TOKEN_INVALID_OR_EXPIRED");
  });

  it("resends verification for an existing unverified account", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-verify-3",
      email: "pending@acme.test",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      emailVerifiedAt: null,
      onboardingCompletedAt: null,
      deletedAt: null,
      company: { name: "Acme Fleet" },
    });
    prismaMock.emailVerificationToken.create.mockResolvedValue({
      id: "verification-resend",
      userId: "user-verify-3",
    });

    const response = await request(app).post("/auth/resend-verification").send({
      email: "pending@acme.test",
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      success: true,
      deliveryMode: "log",
    });
    expect(response.body.data.previewUrl).toEqual(expect.stringContaining("/verify-email?token="));
    expect(prismaMock.emailVerificationToken.create).toHaveBeenCalled();
  });

  it("completes onboarding for a verified account", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: "user-onboarding-1",
        email: "verified@acme.test",
        role: "MANAGER",
        companyId: "company-1",
        company: { name: "Acme Fleet" },
        isPlatformAdmin: false,
        registrationType: "COMPANY",
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: null,
        deletedAt: null,
      })
      .mockResolvedValueOnce({
        id: "user-onboarding-1",
        email: "verified@acme.test",
        role: "MANAGER",
        companyId: "company-1",
        isPlatformAdmin: false,
        registrationType: "COMPANY",
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: null,
        deletedAt: null,
        company: { name: "Acme Fleet" },
      });
    prismaMock.user.update.mockResolvedValue({
      id: "user-onboarding-1",
      email: "verified@acme.test",
      role: "MANAGER",
      companyId: "company-1",
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      company: { name: "Acme Fleet" },
    });

    const token = jwt.sign({ userId: "user-onboarding-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/auth/onboarding/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({
        preferredLanguage: "de",
        preferredTheme: "dark",
        preferredVehicleView: "cards",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.success).toBe(true);
    expect(response.body.data.user.onboardingCompletedAt).toEqual(expect.any(String));
  });

  it("returns a safe success response for forgot-password without enumerating unknown accounts", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const response = await request(app).post("/auth/forgot-password").send({
      email: "missing@solicar.com",
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ success: true });
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("resets the password with a valid one-time token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "reset-token-valid",
      userId: "user-reset-2",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      user: {
        id: "user-reset-2",
        email: "viewer@acme.test",
        companyId: "company-1",
        deletedAt: null,
      },
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-reset-2",
    });
    prismaMock.passwordResetToken.update.mockResolvedValue({
      id: "reset-token-valid",
      usedAt: new Date(),
    });

    const response = await request(app).post("/auth/reset-password").send({
      token: "plain-reset-token-1234567890",
      password: "BrandNew123!",
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ success: true });
    expect(prismaMock.userSession.updateMany).toHaveBeenCalled();
  });

  it("changes the password for the authenticated user", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-3",
      email: "viewer@acme.test",
      password: await bcrypt.hash("OldPassword123!", 10),
      role: "VIEWER",
      companyId: "company-2",
      deletedAt: null,
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-3",
    });

    const token = jwt.sign({ userId: "user-3" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        currentPassword: "OldPassword123!",
        newPassword: "NewPassword123!",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ success: true });
  });

  it("revokes a user session", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-session-1",
      email: "viewer@acme.test",
      role: "VIEWER",
      companyId: "company-2",
      company: { name: "Acme Fleet" },
      isPlatformAdmin: false,
      registrationType: "COMPANY",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      deletedAt: null,
    });
    prismaMock.userSession.updateMany.mockResolvedValue({ count: 1 });

    const token = jwt.sign({ userId: "user-session-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .post("/auth/sessions/session-2/revoke")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      success: true,
      currentSessionRevoked: false,
    });
  });

  it("blocks an individual user from accessing /admin", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "individual-1",
      email: "solo@solicar.com",
      role: "MANAGER",
      companyId: "company-1",
      company: { name: "Individual Workspace" },
      isPlatformAdmin: false,
      registrationType: "INDIVIDUAL",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      deletedAt: null,
    });

    const token = jwt.sign({ userId: "individual-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .get("/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("allows a platform admin to access /admin", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "platform-admin-1",
      email: "admin@solicar.com",
      role: "ADMIN",
      companyId: "company-1",
      company: { name: "Soli Car HQ" },
      isPlatformAdmin: true,
      registrationType: "COMPANY",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      deletedAt: null,
    });
    prismaMock.user.findMany.mockResolvedValue([]);

    const token = jwt.sign({ userId: "platform-admin-1" }, process.env.JWT_SECRET!);

    const response = await request(app)
      .get("/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});
