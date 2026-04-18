import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return res.status(409).json({
      code: "CONFLICT",
      message: "A record with the same unique value already exists",
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        code: "FILE_TOO_LARGE",
        message: "Uploaded file exceeds the allowed size limit",
      });
    }

    return res.status(400).json({
      code: "UPLOAD_ERROR",
      message: "The uploaded file could not be processed",
    });
  }

  const status = err.status ?? 500;
  const code = err.code ?? "INTERNAL_SERVER_ERROR";
  const message = status >= 500 ? "Internal server error" : err.message ?? "Request failed";
  res.status(status).json({ code, message });
};
