import crypto from "node:crypto";

export const generateInvitationToken = () => crypto.randomBytes(24).toString("hex");

export const hashInvitationToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

