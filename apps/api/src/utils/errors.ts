import { Response } from 'express';

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  code?: string,
  details?: unknown
): void {
  res.status(statusCode).json({
    error: message,
    code,
    details
  });
}
