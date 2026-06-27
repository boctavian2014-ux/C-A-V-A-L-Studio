export class CadHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const cadBadRequest = (message: string): CadHttpError =>
  new CadHttpError(400, "bad_request", message);

export const cadUnauthorized = (message = "Unauthorized"): CadHttpError =>
  new CadHttpError(401, "unauthorized", message);

export const cadForbidden = (message = "Forbidden"): CadHttpError =>
  new CadHttpError(403, "forbidden", message);

export const cadNotFound = (message = "Not found"): CadHttpError =>
  new CadHttpError(404, "not_found", message);

export const cadInternal = (message = "Internal server error"): CadHttpError =>
  new CadHttpError(500, "internal_error", message);
