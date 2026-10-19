// An error a route answers with: a status, a stable code for the client and
// an English message it can show.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
