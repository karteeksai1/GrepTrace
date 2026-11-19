import { Response } from 'express';
export interface ApiErrorResponse {
    error: string;
    code?: string;
    details?: unknown;
}
export declare function sendError(res: Response, statusCode: number, message: string, code?: string, details?: unknown): void;
//# sourceMappingURL=errors.d.ts.map