export class HttpError extends Error {
    status;
    code;
    retryAfter;
    constructor(status, code, retryAfter) {
        super(code);
        this.status = status;
        this.code = code;
        this.retryAfter = retryAfter;
    }
}
