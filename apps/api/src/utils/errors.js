export function sendError(res, statusCode, message, code, details) {
    res.status(statusCode).json({
        error: message,
        code,
        details
    });
}
//# sourceMappingURL=errors.js.map