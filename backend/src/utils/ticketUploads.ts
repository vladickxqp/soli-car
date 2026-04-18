import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { createAppError } from "./httpError.js";
import { sanitizeInlineText } from "./sanitize.js";

const PRIVATE_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "private");
const TICKET_ATTACHMENT_DIRECTORY = path.join(PRIVATE_STORAGE_ROOT, "ticket-attachments");
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

const sanitizeFilename = (filename: string) =>
  path
    .basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120);

const ensureDirectory = () => {
  fs.mkdirSync(TICKET_ATTACHMENT_DIRECTORY, { recursive: true });
};

const resolveAttachmentPath = (storagePath: string) => {
  const normalized = storagePath.replace(/^\/+/, "");
  const absolutePath = path.resolve(PRIVATE_STORAGE_ROOT, normalized);

  if (!absolutePath.startsWith(PRIVATE_STORAGE_ROOT)) {
    throw createAppError(400, "INVALID_STORAGE_PATH", "Invalid storage path");
  }

  return absolutePath;
};

export const ticketUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      ensureDirectory();
      callback(null, TICKET_ATTACHMENT_DIRECTORY);
    },
    filename: (_req, file, callback) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `${unique}-${sanitizeFilename(file.originalname) || "attachment"}`);
    },
  }),
  limits: {
    fileSize: MAX_ATTACHMENT_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(createAppError(400, "UNSUPPORTED_FILE_TYPE", "Unsupported file type"));
      return;
    }

    callback(null, true);
  },
});

export const toTicketAttachmentPath = (file?: Express.Multer.File | null) =>
  file ? path.relative(PRIVATE_STORAGE_ROOT, file.path).replace(/\\/g, "/") : undefined;

export const getTicketAttachmentFileName = (storagePath?: string | null) =>
  sanitizeInlineText(storagePath ? path.basename(storagePath) : "") || "attachment";

export const removeTicketAttachment = async (storagePath?: string | null) => {
  if (!storagePath) {
    return;
  }

  try {
    await fsPromises.unlink(resolveAttachmentPath(storagePath));
  } catch {
    // Ignore missing files so retries remain idempotent.
  }
};

export const readTicketAttachment = async (storagePath: string) => {
  const absolutePath = resolveAttachmentPath(storagePath);
  const stats = await fsPromises.stat(absolutePath);
  return {
    absolutePath,
    stats,
  };
};
