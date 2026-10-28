import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	sleep,
	type IDataObject,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INodeListSearchResult,
	type INodeExecutionData,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject as N8nJsonObject,
} from 'n8n-workflow';
import { calleApiRequest } from './shared/transport';
import { prepareGoalConfiguration } from './shared/goalConfiguration';
import {
	assertGoalRunVariables,
	assertRequiredIdempotencyKey,
	buildGoalRunBody,
	buildCreateCallBody,
	buildLegacyCreateCallBody,
	getGoalPath,
	getGoalRunPath,
	getPollingSleepMs,
	isResultReady,
	isTerminalCallStatus,
	parseJsonObject,
} from './shared/utils';

const callOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['call'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a CALL-E call task',
				action: 'Create a call task',
			},
			{
				name: 'Create and Wait',
				value: 'createAndWait',
				description: 'Create a CALL-E call and wait until its result is ready or unavailable',
				action: 'Create a call task and wait for completion',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a CALL-E call task by ID',
				action: 'Get a call task',
			},
			{
				name: 'List Events',
				value: 'listEvents',
				description: 'List developer events for a CALL-E call task',
				action: 'List call task events',
			},
		],
		default: 'create',
	},
];

const goalOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['goal'] } },
		options: [
			{ name: 'List', value: 'list', description: 'List published CALL-E Goals', action: 'List goals' },
			{ name: 'Get', value: 'getGoal', description: 'Get a published CALL-E Goal by ID', action: 'Get a goal' },
		],
		default: 'list',
	},
];

const goalRunOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['goalRun'] } },
		options: [
			{ name: 'Create', value: 'createGoalRun', description: 'Create a phone-specific execution of a published Goal', action: 'Create a goal run' },
			{ name: 'Prepare Configuration', value: 'prepareGoalRun', description: 'Inspect a published Goal and validate business variables without creating a run', action: 'Prepare goal run configuration' },
			{ name: 'Get', value: 'getGoalRun', description: 'Get a Goal Run by Goal and Run ID', action: 'Get a goal run' },
			{ name: 'Create and Wait', value: 'createGoalRunAndWait', description: 'Create a Goal Run and wait until its result is ready or unavailable', action: 'Create a goal run and wait for a result' },
		],
		default: 'createGoalRun',
	},
];

const createFields: INodeProperties[] = [
	{
		displayName: 'Phone Number',
		name: 'phoneNumber',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+14155550100',
		description: 'Recipient phone number in E.164 format. Expressions are supported.',
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['create', 'createAndWait'],
			},
		},
	},
	{
		displayName: 'Task',
		name: 'task',
		type: 'string',
		required: true,
		default: '',
		typeOptions: {
			rows: 4,
		},
		description: 'The phone agent task boundary and expected outcome',
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['create', 'createAndWait'],
			},
		},
	},
	{
		displayName: 'Idempotency Key',
		name: 'idempotencyKey',
		type: 'string',
		required: true,
		default: '={{$execution.id + ":" + $itemIndex}}',
		description: 'Unique key CALL-E can use to avoid duplicate call tasks',
		displayOptions: {
			show: {
				'@version': [1],
				resource: ['call'],
				operation: ['create', 'createAndWait'],
			},
		},
	},
	{
		displayName: 'Idempotency Key',
		name: 'idempotencyKey',
		type: 'string',
		required: true,
		default: '',
		description: 'Stable business key for one call. Reuse the key and unchanged inputs after a timeout.',
		displayOptions: { show: { '@version': [2], resource: ['call'], operation: ['create', 'createAndWait'] } },
	},
	{
		displayName: 'Result Schema',
		name: 'resultSchema',
		type: 'json',
		required: true,
		default: '',
		description: 'Closed JSON object schema with additionalProperties false and at most 32 string, boolean, integer, or number fields',
		displayOptions: { show: { '@version': [2], resource: ['call'], operation: ['create', 'createAndWait'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['create', 'createAndWait'],
			},
		},
		options: [
			{
				displayName: 'Locale',
				name: 'locale',
				type: 'string',
				default: '',
				placeholder: 'en-US',
				description: 'Language and locale hint for the call',
			},
			{
				displayName: 'Metadata',
				name: 'metadata',
				type: 'json',
				default: '',
				description: 'JSON object CALL-E should return with the call task for workflow correlation',
			},
			{
				displayName: 'Recipient Result Schema',
				name: 'recipientResultSchema',
				type: 'json',
				default: '',
				description: 'JSON object schema for each recipient-level structured result',
				displayOptions: { show: { '@version': [1] } },
			},
			{
				displayName: 'Region',
				name: 'region',
				type: 'string',
				default: '',
				placeholder: 'US',
				description: 'Routing or country/region hint for the call',
			},
			{
				displayName: 'Result Schema',
				name: 'resultSchema',
				type: 'json',
				default: '',
				description: 'JSON object schema for the task-level structured result',
				displayOptions: { show: { '@version': [1] } },
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/calle/webhook',
				description: 'Optional URL CALL-E should call when the call task reaches a terminal event',
			},
		],
	},
	{
		displayName: 'Polling Interval (MS)',
		name: 'pollingInterval',
		type: 'number',
		default: 2000,
		typeOptions: {
			minValue: 500,
		},
		description: 'How often to poll CALL-E for the call status',
		displayOptions: {
			show: {
				resource: ['call', 'goalRun'],
				operation: ['createAndWait', 'createGoalRunAndWait'],
			},
		},
	},
	{
		displayName: 'Timeout (MS)',
		name: 'timeout',
		type: 'number',
		default: 600000,
		typeOptions: {
			minValue: 1000,
		},
		description: 'Maximum wait for a final result; a timeout does not cancel the call',
		displayOptions: {
			show: {
				resource: ['call', 'goalRun'],
				operation: ['createAndWait', 'createGoalRunAndWait'],
			},
		},
	},
];

const getFields: INodeProperties[] = [
	{
		displayName: 'Call ID',
		name: 'callId',
		type: 'string',
		required: true,
		default: '',
		description: 'API resource ID returned by Create, not the Billing Call ID',
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['get', 'listEvents'],
			},
		},
	},
	{
		displayName: 'Cursor',
		name: 'cursor',
		type: 'string',
		default: '',
		description: 'Next-page cursor, or last event ID when polling for new events',
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['listEvents'],
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: {
			minValue: 1,
			maxValue: 100,
		},
		description: 'Max number of results to return',
		displayOptions: {
			show: {
				resource: ['call'],
				operation: ['listEvents'],
			},
		},
	},
];

const goalFields: INodeProperties[] = [
	{
		displayName: 'Published Goal',
		name: 'publishedGoal',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'Active published Goal whose input and result fields should be reviewed',
		displayOptions: { show: { resource: ['goalRun'], operation: ['prepareGoalRun'] } },
		modes: [
			{ displayName: 'From List', name: 'list', type: 'list', typeOptions: { searchListMethod: 'getPublishedGoals', searchable: true } },
			{ displayName: 'By ID', name: 'id', type: 'string' },
		],
	},
	{
		displayName: 'Reviewed Goal Interface',
		name: 'reviewedGoalInterface',
		type: 'json',
		default: '',
		description: 'Leave empty to inspect fields, then save the returned goal_json as a fixed value after reviewing the mapping. A changed publication blocks readiness.',
		displayOptions: { show: { resource: ['goalRun'], operation: ['prepareGoalRun'] } },
	},
	{
		displayName: 'Cursor',
		name: 'goalCursor',
		type: 'string',
		default: '',
		description: 'Pagination cursor returned by CALL-E',
		displayOptions: { show: { resource: ['goal'], operation: ['list'] } },
	},
	{
		displayName: 'Limit',
		name: 'goalLimit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 100 },
		description: 'Max number of Goals to return',
		displayOptions: { show: { resource: ['goal'], operation: ['list'] } },
	},
	{
		displayName: 'Goal ID',
		name: 'goalId',
		type: 'string',
		required: true,
		default: '',
		description: 'Published CALL-E Goal ID',
		displayOptions: {
			show: { resource: ['goal', 'goalRun'], operation: ['getGoal', 'createGoalRun', 'getGoalRun', 'createGoalRunAndWait'] },
		},
	},
	{
		displayName: 'Goal Run ID',
		name: 'goalRunId',
		type: 'string',
		required: true,
		default: '',
		description: 'Goal Run ID returned by Create Goal Run',
		displayOptions: { show: { resource: ['goalRun'], operation: ['getGoalRun'] } },
	},
	{
		displayName: 'Phone Number',
		name: 'goalRunPhoneNumber',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+14155550100',
		description: 'Authorized recipient phone number in E.164 format',
		displayOptions: { show: { resource: ['goalRun'], operation: ['createGoalRun', 'createGoalRunAndWait'] } },
	},
	{
		displayName: 'Idempotency Key',
		name: 'goalRunIdempotencyKey',
		type: 'string',
		required: true,
		default: '',
		description: 'Stable business key for one Goal Run. Reuse it only for retries of the exact same request.',
		displayOptions: { show: { resource: ['goalRun'], operation: ['createGoalRun', 'createGoalRunAndWait'] } },
	},
	{
		displayName: 'Variables',
		name: 'goalRunVariables',
		type: 'json',
		default: '',
		description: 'Optional flat object of finite string, boolean, or number values accepted by the published Goal',
		displayOptions: { show: { resource: ['goalRun'], operation: ['prepareGoalRun', 'createGoalRun', 'createGoalRunAndWait'] } },
	},
];

export class Calle implements INodeType {
	methods = {
		listSearch: {
			async getPublishedGoals(
				this: ILoadOptionsFunctions,
				filter = '',
				paginationToken?: string,
			): Promise<INodeListSearchResult> {
				const qs: IDataObject = { limit: 100 };
				if (paginationToken) qs.after = paginationToken;
				const page = await calleApiRequest.call(this, 'GET', '/v1/goals', undefined, qs);
				if (!Array.isArray(page.data)) {
					throw new NodeOperationError(this.getNode(), 'Goal list response must contain data.');
				}
				if (page.next_cursor && page.next_cursor === paginationToken) {
					throw new NodeOperationError(this.getNode(), 'Goal pagination did not advance.');
				}
				return {
					results: page.data
						.filter((goal: IDataObject) => goal.status === 'active' && goal.published_run_spec &&
							`${goal.title ?? ''} ${goal.id}`.toLowerCase().includes(filter.toLowerCase()))
						.map((goal: IDataObject) => ({
							name: `${goal.title || goal.id} — v${(goal.published_run_spec as IDataObject).version} (${goal.id})`,
							value: String(goal.id),
						})),
					...(page.next_cursor ? { paginationToken: String(page.next_cursor) } : {}),
				};
			},
		},
	};

	description: INodeTypeDescription = {
		displayName: 'CALL-E',
		name: 'calle',
		icon: { light: 'file:../../icons/calle.svg', dark: 'file:../../icons/calle.dark.svg' },
		group: ['output'],
		version: [1, 2],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create and monitor CALL-E AI-agent phone-call tasks',
		defaults: {
			name: 'CALL-E',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'calleApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Call',
						value: 'call',
					},
					{
						name: 'Goal',
						value: 'goal',
					},
					{
						name: 'Goal Run',
						value: 'goalRun',
					},
				],
				default: 'call',
			},
			...callOperations,
			...goalOperations,
			...goalRunOperations,
			...createFields,
			...getFields,
			...goalFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				const responseData = await executeResourceOperation.call(this, resource, operation, itemIndex);

				returnData.push({
					json: responseData,
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error instanceof Error ? error.message : String(error) },
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				throw toNodeExecutionError.call(this, error, itemIndex);
			}
		}

		return [returnData];
	}
}

async function executeCallOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	if (operation === 'create') {
		return await createCall.call(this, itemIndex);
	}

	if (operation === 'createAndWait') {
		return await createCallAndWait.call(this, itemIndex);
	}

	if (operation === 'get') {
		return await getCall.call(this, itemIndex);
	}

	if (operation === 'listEvents') {
		return await listCallEvents.call(this, itemIndex);
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`, {
		itemIndex,
	});
}

async function executeResourceOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	if (resource === 'call') {
		return await executeCallOperation.call(this, operation, itemIndex);
	}

	if (resource === 'goal') {
		return await executeGoalOperation.call(this, operation, itemIndex);
	}

	if (resource === 'goalRun') {
		return await executeGoalRunOperation.call(this, operation, itemIndex);
	}

	throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`, { itemIndex });
}

async function createCall(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const body = getCreateCallBody.call(this, itemIndex);
	const key = getRequiredStringParameter.call(this, 'idempotencyKey', itemIndex);
	const idempotencyKey = this.getNode().typeVersion === 1 ? key : assertRequiredIdempotencyKey(key);

	return (await callCalleApi.call(this, 'POST', getCallsPath.call(this), itemIndex, body, {}, {
		'Idempotency-Key': idempotencyKey,
	})) as IDataObject;
}

async function createCallAndWait(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const createdCall = await createCall.call(this, itemIndex);
	const callId = getStringFromResponse.call(this, createdCall, 'id', itemIndex);
	const pollingInterval = getNumberParameter.call(this, 'pollingInterval', itemIndex);
	const timeout = getNumberParameter.call(this, 'timeout', itemIndex);
	const deadline = Date.now() + timeout;

	const resolved = (call: IDataObject) => this.getNode().typeVersion === 1
		? isTerminalCallStatus(String(call.status))
		: isResultReady(call);
	let latestCall = createdCall;
	while (!resolved(latestCall)) {
		const sleepMs = getPollingSleepMs(pollingInterval, deadline);

		if (sleepMs <= 0) {
			break;
		}

		await sleep(sleepMs);
		if (Date.now() >= deadline) break;
		latestCall = await getCallById.call(this, callId, itemIndex);
	}
	if (resolved(latestCall)) return latestCall;

	throw new NodeOperationError(
		this.getNode(),
		`Timed out waiting for CALL-E call ${callId}. Use Get with this ID to resume; a timeout does not cancel the call.`,
		{ itemIndex },
	);
}

function getCallsPath(this: IExecuteFunctions): string {
	return this.getNode().typeVersion === 1 ? '/v1/calls' : '/v2/calls';
}

async function getCall(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const callId = getRequiredStringParameter.call(this, 'callId', itemIndex);
	return await getCallById.call(this, callId, itemIndex);
}

async function getCallById(
	this: IExecuteFunctions,
	callId: string,
	itemIndex: number,
): Promise<IDataObject> {
	return (await callCalleApi.call(
		this,
		'GET',
		`${getCallsPath.call(this)}/${encodeURIComponent(callId)}`,
		itemIndex,
	)) as IDataObject;
}

async function listCallEvents(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const callId = getRequiredStringParameter.call(this, 'callId', itemIndex);
	const cursor = getOptionalStringParameter.call(this, 'cursor', itemIndex);
	const limit = getNumberParameter.call(this, 'limit', itemIndex);
	const qs: IDataObject = { limit };

	if (cursor) {
		qs.cursor = cursor;
	}

	return (await callCalleApi.call(
		this,
		'GET',
		`${getCallsPath.call(this)}/${encodeURIComponent(callId)}/events`,
		itemIndex,
		undefined,
		qs,
	)) as IDataObject;
}

async function executeGoalOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	if (operation === 'list') {
		const qs: IDataObject = { limit: getNumberParameter.call(this, 'goalLimit', itemIndex) };
		const cursor = getOptionalStringParameter.call(this, 'goalCursor', itemIndex);
		if (cursor) qs.after = cursor;
		return (await callCalleApi.call(this, 'GET', '/v1/goals', itemIndex, undefined, qs)) as IDataObject;
	}

	if (operation === 'getGoal') {
		const goalId = getRequiredStringParameter.call(this, 'goalId', itemIndex);
		return (await callCalleApi.call(this, 'GET', getGoalPath(goalId), itemIndex)) as IDataObject;
	}

	throw new NodeOperationError(this.getNode(), `Unsupported Goal operation: ${operation}`, { itemIndex });
}

async function executeGoalRunOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	if (operation === 'prepareGoalRun') {
		const selected = this.getNodeParameter('publishedGoal', itemIndex, '', { extractValue: true });
		const goalId = String(selected).trim();
		if (!goalId) throw new NodeOperationError(this.getNode(), 'Select a published Goal.', { itemIndex });
		const goal = await callCalleApi.call(this, 'GET', getGoalPath(goalId), itemIndex);
		return prepareGoalConfiguration(
			goal,
			this.getNodeParameter('goalRunVariables', itemIndex, ''),
			this.getNodeParameter('reviewedGoalInterface', itemIndex, ''),
			goalId,
		) as IDataObject;
	}
	if (operation === 'createGoalRun') return await createGoalRun.call(this, itemIndex);
	if (operation === 'getGoalRun') return await getGoalRun.call(this, itemIndex);
	if (operation === 'createGoalRunAndWait') return await createGoalRunAndWait.call(this, itemIndex);
	throw new NodeOperationError(this.getNode(), `Unsupported Goal Run operation: ${operation}`, { itemIndex });
}

async function createGoalRun(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const goalId = getRequiredStringParameter.call(this, 'goalId', itemIndex);
	const idempotencyKey = assertRequiredIdempotencyKey(
		getRequiredStringParameter.call(this, 'goalRunIdempotencyKey', itemIndex),
	);
	return (await callCalleApi.call(this, 'POST', `${getGoalPath(goalId)}/runs`, itemIndex, getGoalRunBody.call(this, itemIndex), {}, {
		'Idempotency-Key': idempotencyKey,
	})) as IDataObject;
}

async function getGoalRun(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const goalId = getRequiredStringParameter.call(this, 'goalId', itemIndex);
	const goalRunId = getRequiredStringParameter.call(this, 'goalRunId', itemIndex);
	return (await callCalleApi.call(this, 'GET', getGoalRunPath(goalId, goalRunId), itemIndex)) as IDataObject;
}

async function createGoalRunAndWait(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const createdGoalRun = await createGoalRun.call(this, itemIndex);
	const goalId = getRequiredStringParameter.call(this, 'goalId', itemIndex);
	const goalRunId = getStringFromResponse.call(this, createdGoalRun, 'id', itemIndex);
	const pollingInterval = getNumberParameter.call(this, 'pollingInterval', itemIndex);
	const timeout = getNumberParameter.call(this, 'timeout', itemIndex);
	const deadline = Date.now() + timeout;
	let latestGoalRun = createdGoalRun;

	while (!isResultReady(latestGoalRun)) {
		const sleepMs = getPollingSleepMs(pollingInterval, deadline);
		if (sleepMs <= 0) break;
		await sleep(sleepMs);
		if (Date.now() >= deadline) break;
		latestGoalRun = (await callCalleApi.call(this, 'GET', getGoalRunPath(goalId, goalRunId), itemIndex)) as IDataObject;
	}

	if (isResultReady(latestGoalRun)) return latestGoalRun;
	throw new NodeOperationError(this.getNode(), `Timed out waiting for CALL-E Goal Run ${goalRunId}. Use Get with this ID to resume; a timeout does not cancel the run.`, { itemIndex });
}

function getCreateCallBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const task = getRequiredStringParameter.call(this, 'task', itemIndex);
	const phoneNumber = getRequiredStringParameter.call(this, 'phoneNumber', itemIndex);
	const additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const metadata = parseJsonObject(additionalFields.metadata, 'Metadata');
	const legacy = this.getNode().typeVersion === 1;
	const resultSchema = parseJsonObject(legacy ? additionalFields.resultSchema : this.getNodeParameter('resultSchema', itemIndex, ''), 'Result Schema');
	const recipientResultSchema = parseJsonObject(
		additionalFields.recipientResultSchema,
		'Recipient Result Schema',
	);

	const buildBody = legacy ? buildLegacyCreateCallBody : buildCreateCallBody;
	return buildBody({
		task,
		phoneNumber,
		locale: optionalString(additionalFields.locale),
		region: optionalString(additionalFields.region),
		metadata,
		resultSchema,
		recipientResultSchema,
		webhookUrl: optionalString(additionalFields.webhookUrl),
	}) as unknown as IDataObject;
}

function getGoalRunBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const phoneNumber = getRequiredStringParameter.call(this, 'goalRunPhoneNumber', itemIndex);
	const variables = assertGoalRunVariables(
		parseJsonObject(this.getNodeParameter('goalRunVariables', itemIndex, ''), 'Variables'),
	);
	return buildGoalRunBody({ phoneNumber, variables }) as unknown as IDataObject;
}

async function callCalleApi(
	this: IExecuteFunctions,
	method: 'GET' | 'POST',
	path: string,
	itemIndex: number,
	body?: IDataObject,
	qs: IDataObject = {},
	headers: IDataObject = {},
): Promise<unknown> {
	try {
		return await calleApiRequest.call(this, method, path, body, qs, headers);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as N8nJsonObject, { itemIndex });
	}
}

function toNodeExecutionError(
	this: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
): NodeOperationError | NodeApiError {
	if (error instanceof NodeOperationError || error instanceof NodeApiError) {
		return error;
	}

	return new NodeOperationError(this.getNode(), error as Error, { itemIndex });
}

function getRequiredStringParameter(
	this: IExecuteFunctions,
	name: string,
	itemIndex: number,
): string {
	const value = String(this.getNodeParameter(name, itemIndex, '')).trim();

	if (!value) {
		throw new NodeOperationError(this.getNode(), `${name} is required.`, { itemIndex });
	}

	return value;
}

function getOptionalStringParameter(
	this: IExecuteFunctions,
	name: string,
	itemIndex: number,
): string | undefined {
	const value = String(this.getNodeParameter(name, itemIndex, '')).trim();
	return value || undefined;
}

function getNumberParameter(this: IExecuteFunctions, name: string, itemIndex: number): number {
	const value = Number(this.getNodeParameter(name, itemIndex));

	if (!Number.isFinite(value) || value <= 0) {
		throw new NodeOperationError(this.getNode(), `${name} must be greater than 0.`, {
			itemIndex,
		});
	}

	return value;
}

function getStringFromResponse(
	this: IExecuteFunctions,
	response: IDataObject,
	field: string,
	itemIndex: number,
): string {
	const value = response[field];

	if (typeof value !== 'string' || !value) {
		throw new NodeOperationError(this.getNode(), `CALL-E response did not include ${field}.`, {
			itemIndex,
		});
	}

	return value;
}

function optionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed || undefined;
}
