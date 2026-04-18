import crypto from "node:crypto";

export const generatePasswordResetToken = () => crypto.randomBytes(32).toString("hex");

export const hashPasswordResetToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const getPasswordResetExpiry = () => new Date(Date.now() + 60 * 60 * 1000);
