import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import prisma from "../utils/prisma.js";

type EffectiveRole = "ADMIN" | "MANAGER" | "VIEWER";

const ROLE_LEVEL: Record<EffectiveRole, number> = {
  VIEWER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

const normalizeRole = (role: Role): EffectiveRole => {
  const value = String(role);

  if (value === "USER") {
    return "MANAGER";
  }

  return value as EffectiveRole;
};

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: EffectiveRole;
    companyId: string;
    companyName: string;
    isPlatformAdmin: boolean;
    registrationType: "COMPANY" | "INDIVIDUAL";
    sessionId: string | null;
    emailVerifiedAt: string | null;
    onboardingCompletedAt: string | null;
  };
}

const unauthorized = (res: Response) =>
  res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });

const resolvePlatformAdminAccess = (user: {
  role: Role;
  isPlatformAdmin?: boolean | null;
}) => normalizeRole(user.role) === "ADMIN" && user.isPlatformAdmin === true;

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorized(res);
  }

  const token = authHeader.split(" ")[1];
  try {
    const secret = process.env.JWT_SECRET ?? "secret";
    const payload = jwt.verify(token, secret) as { userId: string; sessionId?: string };

    if (typeof payload.sessionId === "string") {
      const session = await prisma.userSession.findUnique({
        where: { id: payload.sessionId },
        select: {
          id: true,
          userId: true,
          revokedAt: true,
        },
      });

      if (!session || session.userId !== payload.userId || session.revokedAt) {
        return unauthorized(res);
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
        isPlatformAdmin: true,
        registrationType: true,
        emailVerifiedAt: true,
        onboardingCompletedAt: true,
        deletedAt: true,
        company: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!user || user.deletedAt) {
      return unauthorized(res);
    }

    req.user = {
      id: user.id,
      email: user.email,
      companyId: user.companyId,
      companyName: user.company?.name ?? "",
      role: normalizeRole(user.role),
      isPlatformAdmin: resolvePlatformAdminAccess(user),
      registrationType: user.registrationType ?? "COMPANY",
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : null,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    };
    next();
  } catch {
    return unauthorized(res);
  }
};

export const requireRole = (minimumRole: EffectiveRole) => (req: AuthRequest, res: Response, next: NextFunction) => {
  const userRole = req.user?.role;

  if (!userRole || ROLE_LEVEL[userRole] < ROLE_LEVEL[minimumRole]) {
    return res.status(403).json({
      code: "FORBIDDEN",
      message: `${minimumRole} access required`,
    });
  }

  next();
};

export const requireAdmin = requireRole("ADMIN");
export const requireManagerOrAdmin = requireRole("MANAGER");
export const requireViewerOrAbove = requireRole("VIEWER");

export const requirePlatformAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.isPlatformAdmin) {
    return res.status(403).json({
      code: "FORBIDDEN",
      message: "Platform admin access required",
    });
  }

  next();
};
