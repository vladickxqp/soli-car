export interface AppError extends Error {
  status?: number;
  code?: string;
}

export const createAppError = (status: number, code: string, message: string) => {
  const error = new Error(message) as AppError;
  error.status = status;
  error.code = code;
  return error;
};
