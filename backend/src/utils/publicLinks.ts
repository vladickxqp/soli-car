import crypto from "node:crypto";

export const generatePublicShareToken = () => crypto.randomBytes(32).toString("hex");

export const hashPublicShareToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");
