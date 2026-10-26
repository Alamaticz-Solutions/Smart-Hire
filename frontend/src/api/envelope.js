/**
 * Response-envelope support.
 *
 * Every JSON endpoint answers with
 *   { success, message, data, meta, error, request_id }
 * (see backend/app/core/responses.py).  Pages were written against the bare
 * payload, so this interceptor unwraps `data` in one place:
 *
 *   - object payload  -> `{ message, ...data }`  (so `res.data.message` keeps working)
 *   - array payload   -> the array itself
 *   - null payload    -> `{ message }`
 *
 * Failures keep the legacy `err.response.data.detail` string and additionally
 * expose `err.requestId` for support / log correlation.
 */
export function unwrapEnvelope(response) {
    const body = response?.data;
    const isEnvelope =
        body && typeof body === 'object' && !Array.isArray(body) && 'success' in body && ('data' in body || 'error' in body);
    if (!isEnvelope) return response;

    const { data, message } = body;
    if (Array.isArray(data)) {
        response.data = data;
    } else if (data && typeof data === 'object') {
        response.data = { message, ...data };
    } else if (data === null || data === undefined) {
        response.data = { message };
    } else {
        response.data = data;
    }
    response.envelope = body;
    return response;
}

export function annotateError(error) {
    const body = error?.response?.data;
    if (body && typeof body === 'object') {
        if (body.detail === undefined && typeof body.message === 'string') body.detail = body.message;
        error.requestId = body.request_id;
        error.code = body.error?.code;
    }
    return Promise.reject(error);
}

export function installEnvelope(instance) {
    instance.interceptors.response.use(unwrapEnvelope, annotateError);
    return instance;
}
