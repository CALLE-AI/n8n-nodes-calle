"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertValidE164PhoneNumber = assertValidE164PhoneNumber;
exports.parseJsonObject = parseJsonObject;
exports.buildCreateCallBody = buildCreateCallBody;
exports.assertGoalRunVariables = assertGoalRunVariables;
exports.buildGoalRunBody = buildGoalRunBody;
exports.isGoalRunResolved = isGoalRunResolved;
exports.getGoalPath = getGoalPath;
exports.getGoalRunPath = getGoalRunPath;
exports.assertRequiredIdempotencyKey = assertRequiredIdempotencyKey;
exports.isTerminalCallStatus = isTerminalCallStatus;
exports.maskPhoneNumber = maskPhoneNumber;
exports.validateCalleBaseUrl = validateCalleBaseUrl;
exports.getPollingSleepMs = getPollingSleepMs;
const n8n_workflow_1 = require("n8n-workflow");
class CalleValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CalleValidationError';
    }
}
const DEFAULT_BASE_URL = 'https://api.heycall-e.com';
const E164_PATTERN = /^\+[1-9]\d{1,14}$/;
const LOOPBACK_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
function assertValidE164PhoneNumber(phoneNumber) {
    const trimmed = phoneNumber.trim();
    if (!E164_PATTERN.test(trimmed)) {
        throw new CalleValidationError('Phone Number must be in E.164 format, for example +14155550100.');
    }
    return trimmed;
}
function parseJsonObject(value, fieldName) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    const parsed = typeof value === 'string' ? parseJson(value, fieldName) : value;
    if (!isJsonObject(parsed)) {
        throw new CalleValidationError(`${fieldName} must be a JSON object.`);
    }
    return parsed;
}
function buildCreateCallBody(input) {
    const recipient = {
        phones: [assertValidE164PhoneNumber(input.phoneNumber)],
    };
    if (input.locale) {
        recipient.locale = input.locale;
    }
    if (input.region) {
        recipient.region = input.region;
    }
    const body = {
        task: input.task,
        recipients: [recipient],
    };
    if (input.metadata !== undefined) {
        body.metadata = input.metadata;
    }
    if (input.resultSchema !== undefined) {
        body.result_schema = input.resultSchema;
    }
    if (input.recipientResultSchema !== undefined) {
        body.recipient_result_schema = input.recipientResultSchema;
    }
    if (input.webhookUrl) {
        body.webhook_url = input.webhookUrl;
    }
    return body;
}
function assertGoalRunVariables(variables) {
    if (variables === undefined) {
        return undefined;
    }
    for (const [key, value] of Object.entries(variables)) {
        if (value === null || Array.isArray(value) || typeof value === 'object') {
            throw new CalleValidationError(`Variables.${key} must be a flat object scalar value.`);
        }
        if (typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number') {
            throw new CalleValidationError(`Variables.${key} must be a string, boolean, or number.`);
        }
        if (typeof value === 'number' && !Number.isFinite(value)) {
            throw new CalleValidationError(`Variables.${key} must be finite.`);
        }
    }
    return variables;
}
function buildGoalRunBody(input) {
    const variables = assertGoalRunVariables(input.variables);
    const body = {
        phone_number: assertValidE164PhoneNumber(input.phoneNumber),
    };
    if (variables !== undefined && Object.keys(variables).length > 0) {
        body.variables = variables;
    }
    return body;
}
function isGoalRunResolved(goalRun) {
    return ((goalRun.result !== null && goalRun.result !== undefined) ||
        (goalRun.error !== null && goalRun.error !== undefined));
}
function getGoalPath(goalId) {
    return `/v1/goals/${encodePathIdentifier(goalId, 'Goal ID')}`;
}
function getGoalRunPath(goalId, goalRunId) {
    return `${getGoalPath(goalId)}/runs/${encodePathIdentifier(goalRunId, 'Goal Run ID')}`;
}
function assertRequiredIdempotencyKey(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new CalleValidationError('Idempotency Key is required.');
    }
    return trimmed;
}
function isTerminalCallStatus(status) {
    return status === 'completed' || status === 'failed' || status === 'canceled';
}
function maskPhoneNumber(phoneNumber) {
    if (phoneNumber.length < 8) {
        return '***';
    }
    const head = Math.min(5, phoneNumber.length - 7);
    return `${phoneNumber.slice(0, head)}***${phoneNumber.slice(-4)}`;
}
function validateCalleBaseUrl(baseUrl) {
    const rawBaseUrl = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : DEFAULT_BASE_URL;
    let url;
    try {
        url = new URL(rawBaseUrl);
    }
    catch {
        return {
            ok: false,
            message: 'Base URL must be a valid URL.',
        };
    }
    if (url.protocol !== 'https:' && !isAllowedLoopbackHttpUrl(url)) {
        return {
            ok: false,
            message: 'Base URL must use HTTPS unless it points to localhost, 127.0.0.1, or ::1.',
        };
    }
    return {
        ok: true,
        baseUrl: rawBaseUrl.replace(/\/+$/, ''),
    };
}
function getPollingSleepMs(pollingInterval, deadline, now = Date.now()) {
    const remaining = deadline - now;
    if (remaining <= 0) {
        return 0;
    }
    return Math.min(pollingInterval, remaining);
}
function parseJson(value, fieldName) {
    return (0, n8n_workflow_1.jsonParse)(value, { errorMessage: `${fieldName} must contain valid JSON.` });
}
function isJsonObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isAllowedLoopbackHttpUrl(url) {
    return url.protocol === 'http:' && LOOPBACK_HTTP_HOSTS.has(url.hostname.toLowerCase());
}
function encodePathIdentifier(value, fieldName) {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new CalleValidationError(`${fieldName} is required.`);
    }
    return encodeURIComponent(trimmed);
}
//# sourceMappingURL=utils.js.map