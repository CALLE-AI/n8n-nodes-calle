import { parseJsonObject, type JsonObject } from './utils';

type Schema = { properties: Record<string, JsonObject>; required?: string[] } & JsonObject;
type Goal = JsonObject & {
	id: string;
	published_run_spec: { id: string; version: number; input_schema: Schema; result_schema: Schema };
};
type Finding = { path: string; message: string };

const scalarTypes = ['string', 'integer', 'number', 'boolean'];
const has = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const rootKeys = [
	'$schema',
	'type',
	'description',
	'properties',
	'required',
	'additionalProperties',
];

function object(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matches(value: unknown, kind: unknown): boolean {
	if (Array.isArray(kind))
		return kind.some((type) => (type === 'null' ? value === null : matches(value, type)));
	if (kind === 'integer') return typeof value === 'number' && Number.isInteger(value);
	if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
	return (kind === 'string' || kind === 'boolean') && typeof value === kind;
}

function reject(path: string, message: string): never {
	throw new Error(`${path}: ${message}`);
}

function validateSchema(value: unknown, path: string, result = false): asserts value is Schema {
	if (!object(value)) reject(path, 'The published interface must contain an object schema.');
	const unknown = Object.keys(value).filter((key) => !rootKeys.includes(key));
	if (unknown.length)
		reject(
			path,
			`Unsupported schema keywords: ${unknown.join(', ')}. Review this interface before updating the node.`,
		);
	if (
		value.$schema !== undefined &&
		value.$schema !== 'https://json-schema.org/draft/2020-12/schema'
	)
		reject(path, 'Unsupported JSON Schema dialect.');
	if (value.type !== 'object' || value.additionalProperties !== false)
		reject(path, 'The published schema must be a closed object.');
	if (!object(value.properties) || Object.keys(value.properties).length > 32)
		reject(path, 'Expected at most 32 scalar fields.');
	const required = value.required ?? [];
	if (
		!Array.isArray(required) ||
		required.some(
			(name) => typeof name !== 'string' || !has(value.properties as JsonObject, name),
		) ||
		new Set(required).size !== required.length
	)
		reject(path, 'Required must contain distinct declared field names.');
	if (
		value.description !== undefined &&
		(typeof value.description !== 'string' || value.description.length > 512)
	)
		reject(path, 'Description must contain at most 512 characters.');
	for (const [name, prop] of Object.entries(value.properties)) {
		const field = `${path}.${name}`;
		if (!/^[a-z][a-z0-9_]{0,63}$/.test(name) || !object(prop))
			reject(field, 'Unsupported field name or schema.');
		const allowed = [
			'type',
			'description',
			'enum',
			...(result ? [] : ['default', 'x-calle-source']),
		];
		const extra = Object.keys(prop).filter((key) => !allowed.includes(key));
		if (extra.length) reject(field, `Unsupported field keywords: ${extra.join(', ')}.`);
		const kind = prop.type;
		const valid =
			typeof kind === 'string'
				? scalarTypes.includes(kind)
				: result &&
					Array.isArray(kind) &&
					kind.length === 2 &&
					kind.includes('null') &&
					kind.some((type) => scalarTypes.includes(type)) &&
					new Set(kind).size === 2;
		if (!valid) reject(field, 'Only scalar inputs and nullable scalar results are supported.');
		if (
			prop.description !== undefined &&
			(typeof prop.description !== 'string' || prop.description.length > 512)
		)
			reject(field, 'Description must contain at most 512 characters.');
		if (has(prop, 'default') && !matches(prop.default, kind))
			reject(field, 'Default does not match its type.');
		if (!result && !required.includes(name) && !has(prop, 'default'))
			reject(field, 'An optional input must declare a default.');
		if (
			has(prop, 'x-calle-source') &&
			(typeof prop['x-calle-source'] !== 'string' ||
				!prop['x-calle-source'].trim() ||
				has(prop, 'default'))
		)
			reject(field, 'Invalid source binding.');
		if (has(prop, 'enum')) {
			const values = prop.enum;
			if (
				!Array.isArray(values) ||
				values.length < 1 ||
				values.length > 32 ||
				values.some((item) => !matches(item, kind)) ||
				new Set(values).size !== values.length
			)
				reject(field, 'Enum must contain 1–32 distinct values matching the field type.');
		}
	}
	if (new TextEncoder().encode(JSON.stringify(value)).length > 32768)
		reject(path, 'Schema exceeds the supported 32 KiB profile.');
}

function goalInterface(value: unknown, expectedId?: string): Goal {
	const goal = parseJsonObject(value, 'Goal');
	if (
		!goal ||
		goal.object !== 'goal' ||
		goal.status !== 'active' ||
		typeof goal.id !== 'string' ||
		!goal.id
	)
		reject('goal', 'Select an active published Goal.');
	if (expectedId && goal.id !== expectedId)
		reject('goal.id', 'Response does not match the selected Goal.');
	const spec = goal.published_run_spec;
	if (
		!object(spec) ||
		typeof spec.id !== 'string' ||
		!spec.id ||
		!Number.isInteger(spec.version) ||
		Number(spec.version) < 1
	)
		reject('published_run_spec', 'Expected an immutable RunSpec ID and positive integer version.');
	validateSchema(spec.input_schema, 'input_schema');
	validateSchema(spec.result_schema, 'result_schema', true);
	return goal as Goal;
}

function fields(schema: Schema) {
	return Object.entries(schema.properties).map(([name, prop]) => ({
		name,
		type: prop.type,
		required: (schema.required ?? []).includes(name),
		description: prop.description ?? '',
		...(has(prop, 'default') ? { default: prop.default } : {}),
		...(has(prop, 'enum') ? { enum: prop.enum } : {}),
	}));
}

function canonical(value: unknown): string {
	if (object(value))
		return JSON.stringify(
			Object.keys(value)
				.sort()
				.map((key) => [key, canonical(value[key])]),
		);
	if (Array.isArray(value)) return JSON.stringify(value.map(canonical));
	return JSON.stringify(value);
}

export function prepareGoalConfiguration(
	value: unknown,
	variables: unknown,
	reviewed: unknown,
	expectedId: string,
): JsonObject {
	const goal = goalInterface(value, expectedId);
	const spec = goal.published_run_spec;
	const errors: Finding[] = [];
	const changes: Finding[] = [];
	const effective: JsonObject = Object.fromEntries(
		Object.entries(spec.input_schema.properties)
			.filter(([, prop]) => has(prop, 'default'))
			.map(([name, prop]) => [name, prop.default]),
	);
	try {
		const submitted = parseJsonObject(variables, 'Variables') ?? {};
		Object.assign(effective, submitted);
		for (const name of Object.keys(submitted)) {
			if (!has(spec.input_schema.properties, name))
				errors.push({
					path: `variables.${name}`,
					message: 'Field is not declared by the published Goal.',
				});
		}
		for (const name of spec.input_schema.required ?? []) {
			if (!has(effective, name))
				errors.push({
					path: `variables.${name}`,
					message: 'Map this required field from the business record.',
				});
		}
		for (const [name, prop] of Object.entries(spec.input_schema.properties)) {
			if (!has(effective, name)) continue;
			if (!matches(effective[name], prop.type))
				errors.push({
					path: `variables.${name}`,
					message: `Expected a finite ${String(prop.type)} value.`,
				});
			else if (Array.isArray(prop.enum) && !prop.enum.includes(effective[name]))
				errors.push({
					path: `variables.${name}`,
					message: 'Value is not a published enum option.',
				});
		}
	} catch (error) {
		errors.push({ path: 'variables', message: (error as Error).message });
	}
	if (reviewed === '' || reviewed === undefined || reviewed === null) {
		errors.push({
			path: 'reviewedGoalInterface',
			message:
				'Review the fields, then save goal_json as a fixed Reviewed Goal Interface value before creating a run.',
		});
	} else {
		try {
			const baseline = goalInterface(reviewed);
			if (baseline.id !== goal.id)
				changes.push({
					path: 'goal.id',
					message: 'The reviewed interface belongs to a different Goal.',
				});
			const old = baseline.published_run_spec;
			if (old.id !== spec.id || old.version !== spec.version)
				changes.push({
					path: 'published_run_spec',
					message: `Publication changed from ${old.id} (v${old.version}) to ${spec.id} (v${spec.version}).`,
				});
			for (const section of ['input_schema', 'result_schema'] as const) {
				for (const name of new Set([
					...Object.keys(old[section].properties),
					...Object.keys(spec[section].properties),
				])) {
					if (
						canonical(old[section].properties[name]) !==
							canonical(spec[section].properties[name]) ||
						(old[section].required ?? []).includes(name) !==
							(spec[section].required ?? []).includes(name)
					)
						changes.push({
							path: `${section}.${name}`,
							message:
								'Field added, removed, or changed. Review its mapping, type, required flag, default, and enum.',
						});
				}
			}
			if (changes.length)
				errors.push({
					path: 'reviewedGoalInterface',
					message:
						'Published interface changed. Review the affected mappings before starting a new business event.',
				});
		} catch (error) {
			errors.push({ path: 'reviewedGoalInterface', message: (error as Error).message });
		}
	}
	const ready = errors.length === 0;
	return {
		ready,
		goal_id: ready ? goal.id : '',
		run_spec_id: spec.id,
		run_spec_version: spec.version,
		goal_json: JSON.stringify(goal),
		input_fields: fields(spec.input_schema),
		result_fields: fields(spec.result_schema),
		variables_json: ready ? JSON.stringify(effective) : '',
		errors,
		changes,
	};
}
