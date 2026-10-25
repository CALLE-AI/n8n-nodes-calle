import { jsonParse } from 'n8n-workflow';

export type JsonObject = Record<string, unknown>;

class CalleValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CalleValidationError';
	}
}

export interface CreateCallBodyInput {
	task: string;
	phoneNumber: string;
	locale?: string;
	region?: string;
	metadata?: JsonObject;
	resultSchema?: JsonObject;
	recipientResultSchema?: JsonObject;
	webhookUrl?: string;
}

export interface CreateCallBody {
	task: string;
	phone: string;
	locale?: string;
	region?: string;
	result_schema: JsonObject;
	metadata?: JsonObject;
	webhook_url?: string;
}

export interface LegacyCreateCallBody {
	task: string;
	recipients: Array<{
		phones: string[];
		locale?: string;
		region?: string;
	}>;
	metadata?: JsonObject;
	result_schema?: JsonObject;
	recipient_result_schema?: JsonObject;
	webhook_url?: string;
}

export interface GoalRunBody {
	phone: string;
	variables?: JsonObject;
}

export interface GoalRunBodyInput {
	phoneNumber: string;
	variables?: JsonObject;
}

export type CalleBaseUrlValidationResult =
	| {
			ok: true;
			baseUrl: string;
	  }
	| {
			ok: false;
			message: string;
	  };

const DEFAULT_BASE_URL = 'https://api.heycall-e.com';
const E164_PATTERN = /^\+[1-9]\d{1,14}$/;
const LOOPBACK_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function assertValidE164PhoneNumber(phoneNumber: string): string {
	const trimmed = phoneNumber.trim();

	if (!E164_PATTERN.test(trimmed)) {
		throw new CalleValidationError(
			'Phone Number must be in E.164 format, for example +14155550100.',
		);
	}

	return trimmed;
}

export function parseJsonObject(value: unknown, fieldName: string): JsonObject | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}

	const parsed = typeof value === 'string' ? parseJson(value, fieldName) : value;

	if (!isJsonObject(parsed)) {
		throw new CalleValidationError(`${fieldName} must be a JSON object.`);
	}

	return parsed;
}

export function buildLegacyCreateCallBody(input: CreateCallBodyInput): LegacyCreateCallBody {
	const recipient: LegacyCreateCallBody['recipients'][number] = {
		phones: [assertValidE164PhoneNumber(input.phoneNumber)],
	};

	if (input.locale) {
		recipient.locale = input.locale;
	}

	if (input.region) {
		recipient.region = input.region;
	}

	const body: LegacyCreateCallBody = {
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

export function buildCreateCallBody(input: CreateCallBodyInput): CreateCallBody {
	if (input.recipientResultSchema !== undefined) {
		throw new CalleValidationError(
			'Recipient Result Schema is not supported by Calls v2. Move its required fields into Result Schema.',
		);
	}

	const body: CreateCallBody = {
		task: input.task,
		phone: assertValidE164PhoneNumber(input.phoneNumber),
		result_schema: assertResultSchema(input.resultSchema),
	};

	if (input.locale) body.locale = input.locale;
	if (input.region) body.region = input.region;
	if (input.metadata !== undefined) body.metadata = input.metadata;
	if (input.webhookUrl) body.webhook_url = input.webhookUrl;
	return body;
}

function assertResultSchema(schema: JsonObject | undefined): JsonObject {
	if (!schema || schema.type !== 'object' || schema.additionalProperties !== false) {
		throw new CalleValidationError(
			'Result Schema is required and must use type "object" and additionalProperties false.',
		);
	}
	const properties = schema.properties === undefined ? {} : schema.properties;
	if (!isJsonObject(properties) || Object.keys(properties).length > 32) {
		throw new CalleValidationError('Result Schema must contain at most 32 scalar properties.');
	}
	const combinators = ['allOf', 'anyOf', 'oneOf', 'not'];
	if (combinators.some((key) => key in schema)) {
		throw new CalleValidationError('Result Schema does not support schema combinators.');
	}
	for (const [name, property] of Object.entries(properties)) {
		if (
			!isJsonObject(property) ||
			typeof property.type !== 'string' ||
			!['string', 'boolean', 'integer', 'number'].includes(property.type) ||
			combinators.some((key) => key in property)
		) {
			throw new CalleValidationError(`Result Schema.${name} must use a scalar type without combinators.`);
		}
	}
	return schema;
}

export function assertGoalRunVariables(variables: JsonObject | undefined): JsonObject | undefined {
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

export function buildGoalRunBody(input: GoalRunBodyInput): GoalRunBody {
	const variables = assertGoalRunVariables(input.variables);
	const body: GoalRunBody = {
		phone: assertValidE164PhoneNumber(input.phoneNumber),
	};

	if (variables !== undefined && Object.keys(variables).length > 0) {
		body.variables = variables;
	}

	return body;
}

export function isResultReady(call: JsonObject): boolean {
	return call.result_status === 'available' || call.result_status === 'unavailable' || call.result_status === 'not_applicable';
}

export function getGoalPath(goalId: string): string {
	return `/v1/goals/${encodePathIdentifier(goalId, 'Goal ID')}`;
}

export function getGoalRunPath(goalId: string, goalRunId: string): string {
	return `${getGoalPath(goalId)}/runs/${encodePathIdentifier(goalRunId, 'Goal Run ID')}`;
}

export function assertRequiredIdempotencyKey(value: string): string {
	const trimmed = value.trim();

	if (!trimmed) {
		throw new CalleValidationError('Idempotency Key is required.');
	}
	if (Array.from(trimmed).length > 255) {
		throw new CalleValidationError('Idempotency Key must contain at most 255 characters.');
	}

	return trimmed;
}

export function isTerminalCallStatus(status: string): boolean {
	return status === 'completed' || status === 'failed' || status === 'canceled';
}

export function validateCalleBaseUrl(baseUrl: unknown): CalleBaseUrlValidationResult {
	const rawBaseUrl = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : DEFAULT_BASE_URL;
	let url: URL;

	try {
		url = new URL(rawBaseUrl);
	} catch {
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

export function getPollingSleepMs(pollingInterval: number, deadline: number, now = Date.now()): number {
	const remaining = deadline - now;

	if (remaining <= 0) {
		return 0;
	}

	return Math.min(pollingInterval, remaining);
}

function parseJson(value: string, fieldName: string): unknown {
	return jsonParse(value, { errorMessage: `${fieldName} must contain valid JSON.` });
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAllowedLoopbackHttpUrl(url: URL): boolean {
	return url.protocol === 'http:' && LOOPBACK_HTTP_HOSTS.has(url.hostname.toLowerCase());
}

function encodePathIdentifier(value: string, fieldName: string): string {
	const trimmed = value.trim();

	if (!trimmed) {
		throw new CalleValidationError(`${fieldName} is required.`);
	}

	return encodeURIComponent(trimmed);
}
