import { NextFunction, Request, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";

export const validateBody = (schema: ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Validation failed";

    res.status(400).json({
      code: "VALIDATION_ERROR",
      message,
    });
  }
};

export const validateQuery = (schema: ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
  try {
    req.query = schema.parse(req.query);
    next();
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Validation failed";

    res.status(400).json({
      code: "VALIDATION_ERROR",
      message,
    });
  }
};
