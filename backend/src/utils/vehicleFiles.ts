import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { sanitizeInlineText } from "./sanitize.js";
import { createAppError } from "./httpError.js";

const PRIVATE_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "private");
const PRIVATE_DOCUMENT_DIRECTORY = path.join(PRIVATE_STORAGE_ROOT, "vehicle-documents");
const PUBLIC_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const PUBLIC_IMAGE_DIRECTORY = path.join(PUBLIC_UPLOAD_ROOT, "vehicle-images");

const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_UPLOAD_BYTES = 6 * 1024 * 1024;
const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const sanitizeFileName = (value: string) =>
  path
    .basename(value)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120);

const ensureDirectory = (directory: string) => {
  fs.mkdirSync(directory, { recursive: true });
};

const createDiskUpload = (options: {
  directory: string;
  maxBytes: number;
  mimeTypes: Set<string>;
}) =>
  multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        ensureDirectory(options.directory);
        callback(null, options.directory);
      },
      filename: (_req, file, callback) => {
        const safeName = sanitizeFileName(file.originalname) || "file";
        callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
      },
    }),
    limits: {
      fileSize: options.maxBytes,
      files: 1,
    },
    fileFilter: (_req, file, callback) => {
      if (!options.mimeTypes.has(file.mimetype)) {
        callback(createAppError(400, "UNSUPPORTED_FILE_TYPE", "Unsupported file type"));
        return;
      }

      callback(null, true);
    },
  });

const resolvePrivatePath = (storagePath: string) => {
  const normalized = storagePath.replace(/^\/+/, "");
  const absolutePath = path.resolve(PRIVATE_STORAGE_ROOT, normalized);

  if (!absolutePath.startsWith(PRIVATE_STORAGE_ROOT)) {
    throw createAppError(400, "INVALID_STORAGE_PATH", "Invalid storage path");
  }

  return absolutePath;
};

export const vehicleDocumentUpload = createDiskUpload({
  directory: PRIVATE_DOCUMENT_DIRECTORY,
  maxBytes: MAX_DOCUMENT_UPLOAD_BYTES,
  mimeTypes: DOCUMENT_MIME_TYPES,
});

export const vehicleImageUpload = createDiskUpload({
  directory: PUBLIC_IMAGE_DIRECTORY,
  maxBytes: MAX_IMAGE_UPLOAD_BYTES,
  mimeTypes: IMAGE_MIME_TYPES,
});

export const buildStoredFileMetadata = (file: Express.Multer.File) => ({
  originalName: sanitizeInlineText(file.originalname) || "document",
  storagePath: path.relative(PRIVATE_STORAGE_ROOT, file.path).replace(/\\/g, "/"),
  mimeType: file.mimetype,
  sizeBytes: file.size,
});

export const getPublicImageUrl = (file?: Express.Multer.File | string | null) => {
  if (!file) {
    return null;
  }

  if (typeof file === "string") {
    const normalized = file.trim();
    if (!normalized) {
      return null;
    }

    if (/^https?:\/\//i.test(normalized) || normalized.startsWith("/uploads/")) {
      return normalized;
    }

    return `/uploads/vehicle-images/${path.basename(normalized)}`;
  }

  return `/uploads/vehicle-images/${path.basename(file.path)}`;
};

export const readStoredFile = async (storagePath: string) => {
  const absolutePath = resolvePrivatePath(storagePath);
  const stats = await fsPromises.stat(absolutePath);
  return {
    absolutePath,
    stats,
  };
};

export const removeStoredFile = async (storagePath?: string | null) => {
  if (!storagePath) {
    return;
  }

  try {
    await fsPromises.unlink(resolvePrivatePath(storagePath));
  } catch {
    // Ignore missing files so database cleanup remains idempotent.
  }
};

export const getDownloadFileName = (originalName: string) => sanitizeInlineText(originalName) || "download";
