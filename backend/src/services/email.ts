import nodemailer from "nodemailer";
import { sanitizeInlineText, sanitizeMultilineText } from "../utils/sanitize.js";

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporterPromise: Promise<any> | null = null;

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value == null || value === "") {
    return fallback;
  }

  return value === "true";
};

const getEmailConfig = () => {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? "";
  const from = process.env.SMTP_FROM?.trim();
  const secure = parseBoolean(process.env.SMTP_SECURE, false);
  const requireTLS = parseBoolean(process.env.SMTP_REQUIRE_TLS, false);

  return {
    host,
    port,
    user,
    pass,
    from,
    secure,
    requireTLS,
    enabled: Boolean(host && from),
  };
};

const getTransporter = async () => {
  if (!transporterPromise) {
    const config = getEmailConfig();
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: config.requireTLS,
        auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      }),
    );
  }

  return transporterPromise;
};

export const isEmailDeliveryConfigured = () => getEmailConfig().enabled;

export const getEmailDeliveryMode = () => (isEmailDeliveryConfigured() ? "smtp" : "log");

export const sendTransactionalEmail = async (payload: EmailPayload) => {
  const config = getEmailConfig();
  const subject = sanitizeInlineText(payload.subject);
  const text = sanitizeMultilineText(payload.text);

  if (!config.enabled) {
    console.info(`[email:log] ${payload.to} :: ${subject}\n${text}`);
    return {
      delivered: false,
      mode: "log" as const,
    };
  }

  const transporter = await getTransporter();
  await transporter.sendMail({
    from: config.from,
    to: payload.to,
    subject,
    text,
    html: payload.html,
  });

  return {
    delivered: true,
    mode: "smtp" as const,
  };
};
