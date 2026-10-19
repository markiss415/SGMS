/** An error with an HTTP status that is safe to show to the user. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  static badRequest(msg: string, details?: unknown) { return new ApiError(400, msg, details); }
  static unauthorized(msg = 'Please sign in to continue.') { return new ApiError(401, msg); }
  static forbidden(msg = 'You do not have permission to do that.') { return new ApiError(403, msg); }
  static notFound(msg = 'Record not found.') { return new ApiError(404, msg); }
  static conflict(msg: string) { return new ApiError(409, msg); }
  static tooMany(msg = 'Too many attempts. Please wait a few minutes and try again.') { return new ApiError(429, msg); }
}
