// Centralised error class so services don't have to keep redefining the
// `Error & { statusCode: number }` shape. The global error handler in app.ts
// already reads `error.statusCode`, so any AppError thrown from a service is
// surfaced to the client with the right HTTP code automatically.

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export function statusError(message: string, statusCode: number): AppError {
  return new AppError(message, statusCode);
}
