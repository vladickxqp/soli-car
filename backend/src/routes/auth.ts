import { InvitationStatus, Prisma, SystemEntityType } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { NextFunction, Response, Router } from "express";
import prisma from "../utils/prisma.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  onboardingCompletionSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../validation/schemas.js";
import { AuthRequest, authenticate } from "../middleware/auth.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";
import { createSystemLogFromUnknown } from "../utils/systemLogs.js";
import { ensureCompanySubscription } from "../services/billing.js";
import { hashInvitationToken } from "../utils/invitations.js";
import { emitNotificationEvent, emitNotificationEvents, getCompanyNotificationRecipients } from "../services/notifications.js";
import {
  generatePasswordResetToken,
  getPasswordResetExpiry,
  hashPasswordResetToken,
} from "../utils/passwordReset.js";
import {
  generateEmailVerificationToken,
  getEmailVerificationExpiry,
  hashEmailVerificationToken,
} from "../utils/emailVerification.js";
import { getEmailDeliveryMode, sendTransactionalEmail } from "../services/email.js";

const router = Router();

const getNormalizedEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  code: "LOGIN_RATE_LIMITED",
  message: "Too many sign-in attempts. Please try again shortly.",
  keyGenerator: (req) => `${req.method}:${req.path}:${req.ip}:${getNormalizedEmail(req.body?.email)}`,
});

const passwordResetRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  code: "PASSWORD_RESET_RATE_LIMITED",
  message: "Too many password reset requests. Please try again shortly.",
  keyGenerator: (req) => `${req.method}:${req.path}:${req.ip}:${getNormalizedEmail(req.body?.email)}`,
});

const verificationRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  code: "VERIFICATION_RATE_LIMITED",
  message: "Too many verification requests. Please try again shortly.",
  keyGenerator: (req) => `${req.method}:${req.path}:${req.ip}:${getNormalizedEmail(req.body?.email)}`,
});

type DbClient = typeof prisma | Prisma.TransactionClient;

type AuthUserRecord = {
  id: string;
  email: string;
  role: string;
  companyId: string;
  isPlatformAdmin?: boolean | null;
  registrationType?: "COMPANY" | "INDIVIDUAL";
  emailVerifiedAt?: Date | null;
  onboardingCompletedAt?: Date | null;
  company?: {
    name: string;
  } | null;
};

const authUserSelect = {
  id: true,
  email: true,
  role: true,
  companyId: true,
  isPlatformAdmin: true,
  registrationType: true,
  emailVerifiedAt: true,
  onboardingCompletedAt: true,
  company: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.UserSelect;

const signToken = (userId: string, sessionId?: string | null) =>
  jwt.sign({ userId, sessionId: sessionId ?? undefined }, process.env.JWT_SECRET ?? "secret", {
    expiresIn: "7d",
  });

const normalizeRole = (role: string) => (role === "USER" ? "MANAGER" : role);

const buildPersonalWorkspaceName = (email: string) => {
  const localPart = email.trim().toLowerCase().split("@")[0] ?? "user";
  return `Personal Workspace - ${localPart}`;
};

const buildResetUrl = (token: string) => {
  const appUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "");
  return `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
};

const buildVerificationUrl = (token: string) => {
  const appUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "");
  return `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;
};

const buildAuthUserPayload = (user: AuthUserRecord, sessionId?: string | null) => ({
  id: user.id,
  email: user.email,
  role: normalizeRole(user.role),
  companyId: user.companyId,
  companyName: user.company?.name ?? "",
  isPlatformAdmin: Boolean(user.isPlatformAdmin),
  registrationType: user.registrationType ?? "COMPANY",
  emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
  sessionId: sessionId ?? null,
});

const authUserResponse = (user: AuthUserRecord, sessionId: string) => ({
  token: signToken(user.id, sessionId),
  user: buildAuthUserPayload(user, sessionId),
});

type VerificationDeliveryResponse = {
  deliveryMode: "smtp" | "log" | "failed";
  previewUrl: string | null;
};

const createVerificationRequiredResponse = (email: string, delivery?: VerificationDeliveryResponse) => ({
  success: true,
  requiresEmailVerification: true,
  email,
  deliveryMode: delivery?.deliveryMode ?? null,
  previewUrl: delivery?.previewUrl ?? null,
});

const createUserSession = async (db: DbClient, userId: string, req: { ip?: string; get?: (name: string) => string | undefined }) => {
  const session = await db.userSession.create({
    data: {
      userId,
      ipAddress: req.ip ? String(req.ip).slice(0, 120) : null,
      userAgent: req.get?.("user-agent")?.slice(0, 255) ?? null,
    },
    select: {
      id: true,
    },
  });

  return session.id;
};

const createEmailVerificationTokenRecord = async (db: DbClient, userId: string) => {
  const token = generateEmailVerificationToken();
  const tokenHash = hashEmailVerificationToken(token);
  const expiresAt = getEmailVerificationExpiry();

  await db.emailVerificationToken.updateMany({
    where: {
      userId,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  await db.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return {
    token,
    expiresAt,
  };
};

const deliverVerificationEmail = async (
  user: Pick<AuthUserRecord, "id" | "email" | "companyId" | "company">,
  token: string,
  action: "EMAIL_VERIFICATION_SENT" | "EMAIL_VERIFICATION_RESENT",
) => {
  let deliveryMode: "smtp" | "log" | "failed" = "failed";
  const verificationUrl = buildVerificationUrl(token);

  try {
    const result = await sendTransactionalEmail({
      to: user.email,
      subject: "Verify your Soli Car email",
      text: [
        "Welcome to Soli Car.",
        "",
        `Verify your email to continue: ${verificationUrl}`,
        "",
        "This link expires in 24 hours.",
      ].join("\n"),
    });
    deliveryMode = result.mode;
  } catch (error) {
    console.error("[auth] failed to deliver verification email", error);
  }

  await createSystemLogFromUnknown(prisma, {
    userId: user.id,
    companyId: user.companyId,
    action,
    entityType: SystemEntityType.USER,
    entityId: user.id,
    metadata: {
      email: user.email,
      companyName: user.company?.name ?? null,
      deliveryMode,
    },
  });

  return {
    deliveryMode,
    previewUrl: deliveryMode === "log" ? verificationUrl : null,
  } satisfies VerificationDeliveryResponse;
};

router.post("/register", validateBody(registerSchema), async (req, res: Response, next: NextFunction) => {
  try {
    const { email, password, companyName, registrationType, invitationToken } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return res.status(400).json({
        code: "EMAIL_ALREADY_REGISTERED",
        message: "Email already registered",
      });
    }

    if (invitationToken && registrationType !== "COMPANY") {
      return res.status(400).json({
        code: "INVITATION_COMPANY_ONLY",
        message: "Invitations can only be accepted into a company workspace",
      });
    }

    if (invitationToken) {
      const tokenHash = hashInvitationToken(invitationToken);
      const invitation = await prisma.companyInvitation.findUnique({
        where: { tokenHash },
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          inviter: {
            select: {
              email: true,
            },
          },
        },
      });

      if (!invitation) {
        return res.status(400).json({
          code: "INVITATION_INVALID",
          message: "Invitation is invalid",
        });
      }

      if (invitation.status !== InvitationStatus.PENDING) {
        return res.status(400).json({
          code: "INVITATION_NOT_ACCEPTABLE",
          message: "Invitation can no longer be accepted",
        });
      }

      if (invitation.expiresAt.getTime() < Date.now()) {
        await prisma.companyInvitation.update({
          where: { id: invitation.id },
          data: {
            status: InvitationStatus.EXPIRED,
          },
        });

        return res.status(400).json({
          code: "INVITATION_EXPIRED",
          message: "Invitation has expired",
        });
      }

      if (invitation.email !== email) {
        return res.status(400).json({
          code: "INVITATION_EMAIL_MISMATCH",
          message: "Invitation email does not match this registration email",
        });
      }

      await ensureCompanySubscription(prisma, invitation.company.id, invitation.company.name);
      const hashedPassword = await bcrypt.hash(password, 10);

      const created = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            companyId: invitation.company.id,
            role: invitation.role,
            isPlatformAdmin: false,
            registrationType: "COMPANY",
          },
          select: authUserSelect,
        });

        await tx.companyInvitation.update({
          where: { id: invitation.id },
          data: {
            status: InvitationStatus.ACCEPTED,
            acceptedAt: new Date(),
            acceptedById: createdUser.id,
          },
        });

        await createSystemLogFromUnknown(tx, {
          userId: createdUser.id,
          companyId: createdUser.companyId,
          action: "USER_REGISTER",
          entityType: SystemEntityType.USER,
          entityId: createdUser.id,
          metadata: {
            email: createdUser.email,
            companyId: createdUser.companyId,
            role: normalizeRole(createdUser.role),
            registrationType: "COMPANY",
            isPlatformAdmin: false,
            invitationId: invitation.id,
          },
        });

        await createSystemLogFromUnknown(tx, {
          userId: createdUser.id,
          companyId: invitation.company.id,
          action: "INVITATION_ACCEPTED",
          entityType: SystemEntityType.INVITATION,
          entityId: invitation.id,
          metadata: {
            email: invitation.email,
            companyId: invitation.company.id,
            acceptedUserId: createdUser.id,
            role: normalizeRole(invitation.role),
          },
        });

        await emitNotificationEvent(tx, {
          userId: createdUser.id,
          companyId: invitation.company.id,
          action: "INVITATION_ACCEPTED_NOTIFICATION",
          entityType: SystemEntityType.INVITATION,
          entityId: invitation.id,
          recipientEmail: invitation.inviter?.email ?? null,
          channel: "EMAIL",
          payload: {
            companyId: invitation.company.id,
            companyName: invitation.company.name,
            inviteeEmail: invitation.email,
          },
        });

        const companyRecipients = await getCompanyNotificationRecipients(tx, invitation.company.id, {
          minimumRole: "ADMIN",
          excludeUserIds: [createdUser.id],
        });

        await emitNotificationEvents(
          tx,
          companyRecipients.map((recipient) => ({
            userId: recipient.id,
            companyId: invitation.company.id,
            action: "INVITATION_ACCEPTED_IN_APP",
            entityType: SystemEntityType.INVITATION,
            entityId: invitation.id,
            channel: "IN_APP" as const,
            payload: {
              notificationType: "INVITATION",
              title: "Invitation accepted",
              message: `${createdUser.email} joined ${invitation.company.name}.`,
              priority: "LOW",
              link: "/companies",
              sourceKey: `invitation-accepted:${invitation.id}:${recipient.id}`,
              companyId: invitation.company.id,
            },
          })),
        );

        const verification = await createEmailVerificationTokenRecord(tx, createdUser.id);

        return {
          user: createdUser,
          verification,
        };
      });

      const delivery = await deliverVerificationEmail(created.user, created.verification.token, "EMAIL_VERIFICATION_SENT");

      return res.status(201).json({
        data: createVerificationRequiredResponse(created.user.email, delivery),
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const created = await prisma.$transaction(async (tx) => {
      const workspaceName =
        registrationType === "COMPANY" ? companyName.trim() : buildPersonalWorkspaceName(email);

      if (registrationType === "COMPANY") {
        const existingCompany = await tx.company.findUnique({
          where: { name: workspaceName },
          select: { id: true },
        });

        if (existingCompany) {
          return {
            conflict: true as const,
          };
        }
      }

      const company = await tx.company.create({
        data: {
          name: workspaceName,
        },
      });

      await ensureCompanySubscription(tx, company.id, company.name);

      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          companyId: company.id,
          role: "MANAGER",
          isPlatformAdmin: false,
          registrationType,
        },
        select: authUserSelect,
      });

      await createSystemLogFromUnknown(tx, {
        userId: user.id,
        companyId: user.companyId,
        action: "USER_REGISTER",
        entityType: SystemEntityType.USER,
        entityId: user.id,
        metadata: {
          email: user.email,
          companyId: user.companyId,
          role: normalizeRole(user.role),
          registrationType,
          isPlatformAdmin: false,
        },
      });

      const verification = await createEmailVerificationTokenRecord(tx, user.id);
      return { user, verification, conflict: false as const };
    });

    if (created.conflict) {
      return res.status(409).json({
        code: "COMPANY_NAME_ALREADY_EXISTS",
        message: "A workspace with this company name already exists",
      });
    }

    const delivery = await deliverVerificationEmail(created.user, created.verification.token, "EMAIL_VERIFICATION_SENT");

    res.status(201).json({
      data: createVerificationRequiredResponse(created.user.email, delivery),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/resend-verification", verificationRateLimit, validateBody(resendVerificationSchema), async (req, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: req.body.email },
      select: {
        ...authUserSelect,
        deletedAt: true,
      },
    });

    let delivery: VerificationDeliveryResponse = {
      deliveryMode: getEmailDeliveryMode(),
      previewUrl: getEmailDeliveryMode() === "log" ? buildVerificationUrl(generateEmailVerificationToken()) : null,
    };

    if (user && !user.deletedAt && !user.emailVerifiedAt) {
      const verification = await prisma.$transaction(async (tx) => createEmailVerificationTokenRecord(tx, user.id));
      delivery = await deliverVerificationEmail(user, verification.token, "EMAIL_VERIFICATION_RESENT");
    }

    res.json({
      data: {
        success: true,
        deliveryMode: delivery.deliveryMode,
        previewUrl: delivery.previewUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/verify-email", validateBody(verifyEmailSchema), async (req, res: Response, next: NextFunction) => {
  try {
    const tokenHash = hashEmailVerificationToken(req.body.token);
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            ...authUserSelect,
            deletedAt: true,
          },
        },
      },
    });

    if (
      !verificationToken ||
      verificationToken.usedAt ||
      verificationToken.expiresAt.getTime() < Date.now() ||
      verificationToken.user.deletedAt
    ) {
      return res.status(400).json({
        code: "EMAIL_VERIFICATION_TOKEN_INVALID_OR_EXPIRED",
        message: "Verification token is invalid or expired",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.emailVerificationToken.updateMany({
        where: {
          userId: verificationToken.userId,
          usedAt: null,
          id: {
            not: verificationToken.id,
          },
        },
        data: {
          usedAt: new Date(),
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: verificationToken.userId },
        data: {
          emailVerifiedAt: verificationToken.user.emailVerifiedAt ?? new Date(),
        },
        select: authUserSelect,
      });

      const sessionId = await createUserSession(tx, updatedUser.id, req);

      await createSystemLogFromUnknown(tx, {
        userId: updatedUser.id,
        companyId: updatedUser.companyId,
        action: "EMAIL_VERIFIED",
        entityType: SystemEntityType.USER,
        entityId: updatedUser.id,
        metadata: {
          email: updatedUser.email,
          companyId: updatedUser.companyId,
          companyName: updatedUser.company?.name ?? null,
        },
      });

      return {
        user: updatedUser,
        sessionId,
      };
    });

    res.json({
      data: authUserResponse(result.user, result.sessionId),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", loginRateLimit, validateBody(loginSchema), async (req, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        ...authUserSelect,
        password: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt) {
      await createSystemLogFromUnknown(prisma, {
        userId: user?.id,
        companyId: user?.companyId ?? null,
        action: "LOGIN_FAILED",
        entityType: SystemEntityType.USER,
        entityId: user?.id,
        metadata: {
          email,
          reason: user?.deletedAt ? "ACCOUNT_DISABLED" : "USER_NOT_FOUND",
          ip: req.ip,
        },
      });

      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials",
      });
    }

    if (!user.emailVerifiedAt) {
      await createSystemLogFromUnknown(prisma, {
        userId: user.id,
        companyId: user.companyId,
        action: "LOGIN_FAILED",
        entityType: SystemEntityType.USER,
        entityId: user.id,
        metadata: {
          email,
          reason: "EMAIL_NOT_VERIFIED",
          ip: req.ip,
        },
      });

      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "Email verification required",
      });
    }

    const matched = await bcrypt.compare(password, user.password);
    if (!matched) {
      await createSystemLogFromUnknown(prisma, {
        userId: user.id,
        companyId: user.companyId,
        action: "LOGIN_FAILED",
        entityType: SystemEntityType.USER,
        entityId: user.id,
        metadata: {
          email,
          reason: "INVALID_PASSWORD",
          ip: req.ip,
        },
      });

      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials",
      });
    }

    const sessionId = await createUserSession(prisma, user.id, req);

    await createSystemLogFromUnknown(prisma, {
      userId: user.id,
      companyId: user.companyId,
      action: "LOGIN_SUCCESS",
      entityType: SystemEntityType.USER,
      entityId: user.id,
      metadata: {
        email: user.email,
        role: normalizeRole(user.role),
        companyId: user.companyId,
        ip: req.ip,
        sessionId,
      },
    });

    res.json({
      data: authUserResponse(user, sessionId),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/forgot-password", passwordResetRateLimit, validateBody(forgotPasswordSchema), async (req, res: Response, next: NextFunction) => {
  try {
    const email = req.body.email;
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        companyId: true,
        deletedAt: true,
      },
    });

    if (existingUser && !existingUser.deletedAt) {
      const resetToken = generatePasswordResetToken();
      const tokenHash = hashPasswordResetToken(resetToken);
      const expiresAt = getPasswordResetExpiry();
      const resetUrl = buildResetUrl(resetToken);

      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: {
            userId: existingUser.id,
            usedAt: null,
          },
          data: {
            usedAt: new Date(),
          },
        });

        await tx.passwordResetToken.create({
          data: {
            userId: existingUser.id,
            tokenHash,
            expiresAt,
          },
        });

        await createSystemLogFromUnknown(tx, {
          userId: existingUser.id,
          companyId: existingUser.companyId ?? null,
          action: "PASSWORD_RESET_REQUESTED",
          entityType: SystemEntityType.USER,
          entityId: existingUser.id,
          metadata: {
            email: existingUser.email,
            expiresAt: expiresAt.toISOString(),
            ip: req.ip,
          },
        });

        await emitNotificationEvent(tx, {
          userId: existingUser.id,
          companyId: existingUser.companyId ?? null,
          action: "PASSWORD_RESET_EMAIL",
          entityType: SystemEntityType.USER,
          entityId: existingUser.id,
          recipientEmail: existingUser.email,
          channel: "EMAIL",
          payload: {
            subject: "Reset your Soli Car password",
            resetUrl,
            companyId: existingUser.companyId,
            expiresAt: expiresAt.toISOString(),
          },
        });
      });
    }

    res.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-password", validateBody(resetPasswordSchema), async (req, res: Response, next: NextFunction) => {
  try {
    const tokenHash = hashPasswordResetToken(req.body.token);
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            companyId: true,
            deletedAt: true,
          },
        },
      },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() < Date.now() ||
      resetToken.user.deletedAt
    ) {
      return res.status(400).json({
        code: "RESET_TOKEN_INVALID_OR_EXPIRED",
        message: "Reset token is invalid or expired",
      });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          password: hashedPassword,
        },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
          id: {
            not: resetToken.id,
          },
        },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.userSession.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await createSystemLogFromUnknown(tx, {
        userId: resetToken.userId,
        companyId: resetToken.user.companyId ?? null,
        action: "PASSWORD_RESET_COMPLETED",
        entityType: SystemEntityType.USER,
        entityId: resetToken.userId,
        metadata: {
          email: resetToken.user.email,
          ip: req.ip,
        },
      });
    });

    res.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/change-password",
  authenticate,
  validateBody(changePasswordSchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          email: true,
          password: true,
          companyId: true,
          role: true,
          isPlatformAdmin: true,
          registrationType: true,
          deletedAt: true,
        },
      });

      if (!existingUser || existingUser.deletedAt) {
        return res.status(401).json({
          code: "UNAUTHORIZED",
          message: "Unauthorized",
        });
      }

      const currentPasswordMatches = await bcrypt.compare(req.body.currentPassword, existingUser.password);
      if (!currentPasswordMatches) {
        return res.status(400).json({
          code: "CURRENT_PASSWORD_INVALID",
          message: "Current password is incorrect",
        });
      }

      const hashedPassword = await bcrypt.hash(req.body.newPassword, 10);
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { password: hashedPassword },
      });

      await createSystemLogFromUnknown(prisma, {
        userId: existingUser.id,
        companyId: existingUser.companyId,
        action: "USER_PASSWORD_CHANGE",
        entityType: SystemEntityType.USER,
        entityId: existingUser.id,
        metadata: {
          email: existingUser.email,
          companyId: existingUser.companyId,
          role: normalizeRole(existingUser.role),
          isPlatformAdmin: Boolean(existingUser.isPlatformAdmin),
          registrationType: existingUser.registrationType,
        },
      });

      res.json({
        data: {
          success: true,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/onboarding/complete",
  authenticate,
  validateBody(onboardingCompletionSchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          ...authUserSelect,
          deletedAt: true,
        },
      });

      if (!currentUser || currentUser.deletedAt) {
        return res.status(401).json({
          code: "UNAUTHORIZED",
          message: "Unauthorized",
        });
      }

      const updatedUser = await prisma.user.update({
        where: { id: currentUser.id },
        data: {
          onboardingCompletedAt: currentUser.onboardingCompletedAt ?? new Date(),
        },
        select: authUserSelect,
      });

      if (!currentUser.onboardingCompletedAt) {
        await createSystemLogFromUnknown(prisma, {
          userId: currentUser.id,
          companyId: currentUser.companyId,
          action: "ONBOARDING_COMPLETED",
          entityType: SystemEntityType.USER,
          entityId: currentUser.id,
          metadata: {
            email: currentUser.email,
            preferredLanguage: req.body.preferredLanguage ?? null,
            preferredTheme: req.body.preferredTheme ?? null,
            preferredVehicleView: req.body.preferredVehicleView ?? null,
          },
        });
      }

      res.json({
        data: {
          success: true,
          user: buildAuthUserPayload(updatedUser, req.user!.sessionId),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/sessions", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sessions = await prisma.userSession.findMany({
      where: {
        userId: req.user!.id,
        revokedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastSeenAt: true,
        revokedAt: true,
      },
    });

    res.json({
      data: sessions.map((session) => ({
        ...session,
        isCurrent: req.user!.sessionId === session.id,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/sessions/:id/revoke", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await prisma.userSession.updateMany({
      where: {
        id: req.params.id,
        userId: req.user!.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return res.status(404).json({
        code: "SESSION_NOT_FOUND",
        message: "Session not found",
      });
    }

    await createSystemLogFromUnknown(prisma, {
      userId: req.user!.id,
      companyId: req.user!.companyId,
      action: "SESSION_REVOKED",
      entityType: SystemEntityType.USER,
      entityId: req.user!.id,
      metadata: {
        sessionId: req.params.id,
      },
    });

    res.json({
      data: {
        success: true,
        currentSessionRevoked: req.user!.sessionId === req.params.id,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.sessionId) {
      await prisma.userSession.updateMany({
        where: {
          id: req.user!.sessionId,
          userId: req.user!.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await createSystemLogFromUnknown(prisma, {
        userId: req.user!.id,
        companyId: req.user!.companyId,
        action: "SESSION_REVOKED",
        entityType: SystemEntityType.USER,
        entityId: req.user!.id,
        metadata: {
          sessionId: req.user!.sessionId,
          reason: "logout",
        },
      });
    }

    res.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
