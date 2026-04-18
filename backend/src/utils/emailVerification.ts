import crypto from "node:crypto";

export const generateEmailVerificationToken = () => crypto.randomBytes(32).toString("hex");

export const hashEmailVerificationToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const getEmailVerificationExpiry = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
