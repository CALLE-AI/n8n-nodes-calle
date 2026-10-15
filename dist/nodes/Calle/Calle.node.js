"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Calle = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const transport_1 = require("./shared/transport");
const utils_1 = require("./shared/utils");
const callOperations = [
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
const goalOperations = [
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
const goalRunOperations = [
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['goalRun'] } },
        options: [
            { name: 'Create', value: 'createGoalRun', description: 'Create a phone-specific execution of a published Goal', action: 'Create a goal run' },
            { name: 'Get', value: 'getGoalRun', description: 'Get a Goal Run by Goal and Run ID', action: 'Get a goal run' },
            { name: 'Create and Wait', value: 'createGoalRunAndWait', description: 'Create a Goal Run and wait until its result is ready or unavailable', action: 'Create a goal run and wait for a result' },
        ],
        default: 'createGoalRun',
    },
];
const createFields = [
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
const getFields = [
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
const goalFields = [
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
        displayOptions: { show: { resource: ['goalRun'], operation: ['createGoalRun', 'createGoalRunAndWait'] } },
    },
];
class Calle {
    constructor() {
        this.description = {
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
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
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
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            try {
                const resource = this.getNodeParameter('resource', itemIndex);
                const operation = this.getNodeParameter('operation', itemIndex);
                const responseData = await executeResourceOperation.call(this, resource, operation, itemIndex);
                returnData.push({
                    json: responseData,
                    pairedItem: { item: itemIndex },
                });
            }
            catch (error) {
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
exports.Calle = Calle;
async function executeCallOperation(operation, itemIndex) {
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
    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`, {
        itemIndex,
    });
}
async function executeResourceOperation(resource, operation, itemIndex) {
    if (resource === 'call') {
        return await executeCallOperation.call(this, operation, itemIndex);
    }
    if (resource === 'goal') {
        return await executeGoalOperation.call(this, operation, itemIndex);
    }
    if (resource === 'goalRun') {
        return await executeGoalRunOperation.call(this, operation, itemIndex);
    }
    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`, { itemIndex });
}
async function createCall(itemIndex) {
    const body = getCreateCallBody.call(this, itemIndex);
    const key = getRequiredStringParameter.call(this, 'idempotencyKey', itemIndex);
    const idempotencyKey = this.getNode().typeVersion === 1 ? key : (0, utils_1.assertRequiredIdempotencyKey)(key);
    return (await callCalleApi.call(this, 'POST', getCallsPath.call(this), itemIndex, body, {}, {
        'Idempotency-Key': idempotencyKey,
    }));
}
async function createCallAndWait(itemIndex) {
    const createdCall = await createCall.call(this, itemIndex);
    const callId = getStringFromResponse.call(this, createdCall, 'id', itemIndex);
    const pollingInterval = getNumberParameter.call(this, 'pollingInterval', itemIndex);
    const timeout = getNumberParameter.call(this, 'timeout', itemIndex);
    const deadline = Date.now() + timeout;
    const resolved = (call) => this.getNode().typeVersion === 1
        ? (0, utils_1.isTerminalCallStatus)(String(call.status))
        : (0, utils_1.isResultReady)(call);
    let latestCall = createdCall;
    while (!resolved(latestCall)) {
        const sleepMs = (0, utils_1.getPollingSleepMs)(pollingInterval, deadline);
        if (sleepMs <= 0) {
            break;
        }
        await (0, n8n_workflow_1.sleep)(sleepMs);
        if (Date.now() >= deadline)
            break;
        latestCall = await getCallById.call(this, callId, itemIndex);
    }
    if (resolved(latestCall))
        return latestCall;
    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Timed out waiting for CALL-E call ${callId}. Use Get with this ID to resume; a timeout does not cancel the call.`, { itemIndex });
}
function getCallsPath() {
    return this.getNode().typeVersion === 1 ? '/v1/calls' : '/v2/calls';
}
async function getCall(itemIndex) {
    const callId = getRequiredStringParameter.call(this, 'callId', itemIndex);
    return await getCallById.call(this, callId, itemIndex);
}
async function getCallById(callId, itemIndex) {
    return (await callCalleApi.call(this, 'GET', `${getCallsPath.call(this)}/${encodeURIComponent(callId)}`, itemIndex));
}
async function listCallEvents(itemIndex) {
    const callId = getRequiredStringParameter.call(this, 'callId', itemIndex);
    const cursor = getOptionalStringParameter.call(this, 'cursor', itemIndex);
    const limit = getNumberParameter.call(this, 'limit', itemIndex);
    const qs = { limit };
    if (cursor) {
        qs.cursor = cursor;
    }
    return (await callCalleApi.call(this, 'GET', `${getCallsPath.call(this)}/${encodeURIComponent(callId)}/events`, itemIndex, undefined, qs));
}
async function executeGoalOperation(operation, itemIndex) {
    if (operation === 'list') {
        const qs = { limit: getNumberParameter.call(this, 'goalLimit', itemIndex) };
        const cursor = getOptionalStringParameter.call(this, 'goalCursor', itemIndex);
        if (cursor)
            qs.after = cursor;
        return (await callCalleApi.call(this, 'GET', '/v1/goals', itemIndex, undefined, qs));
    }
    if (operation === 'getGoal') {
        const goalId = getRequiredStringParameter.call(this, 'goalId', itemIndex);
        return (await callCalleApi.call(this, 'GET', (0, utils_1.getGoalPath)(goalId), itemIndex));
    }
    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Unsupported Goal operation: ${operation}`, { itemIndex });
}
async function executeGoalRunOperation(operation, itemIndex) {
    if (operation === 'createGoalRun')
        return await createGoalRun.call(this, itemIndex);
    if (operation === 'getGoalRun')
        return await getGoalRun.call(this, itemIndex);
    if (operation === 'createGoalRunAndWait')
        return await createGoalRunAndWait.call(this, itemIndex);
    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Unsupported Goal Run operation: ${operation}`, { itemIndex });
}
async function createGoalRun(itemIndex) {
    const goalId = getRequiredStringParameter.call(this, 'goalId', itemIndex);
    const idempotencyKey = (0, utils_1.assertRequiredIdempotencyKey)(getRequiredStringParameter.call(this, 'goalRunIdempotencyKey', itemIndex));
    return (await callCalleApi.call(this, 'POST', `${(0, utils_1.getGoalPath)(goalId)}/runs`, itemIndex, getGoalRunBody.call(this, itemIndex), {}, {
        'Idempotency-Key': idempotencyKey,
    }));
}
async function getGoalRun(itemIndex) {
    const goalId = getRequiredStringParameter.call(this, 'goalId', itemIndex);
    const goalRunId = getRequiredStringParameter.call(this, 'goalRunId', itemIndex);
    return (await callCalleApi.call(this, 'GET', (0, utils_1.getGoalRunPath)(goalId, goalRunId), itemIndex));
}
async function createGoalRunAndWait(itemIndex) {
    const createdGoalRun = await createGoalRun.call(this, itemIndex);
    const goalId = getRequiredStringParameter.call(this, 'goalId', itemIndex);
    const goalRunId = getStringFromResponse.call(this, createdGoalRun, 'id', itemIndex);
    const pollingInterval = getNumberParameter.call(this, 'pollingInterval', itemIndex);
    const timeout = getNumberParameter.call(this, 'timeout', itemIndex);
    const deadline = Date.now() + timeout;
    let latestGoalRun = createdGoalRun;
    while (!(0, utils_1.isResultReady)(latestGoalRun)) {
        const sleepMs = (0, utils_1.getPollingSleepMs)(pollingInterval, deadline);
        if (sleepMs <= 0)
            break;
        await (0, n8n_workflow_1.sleep)(sleepMs);
        if (Date.now() >= deadline)
            break;
        latestGoalRun = (await callCalleApi.call(this, 'GET', (0, utils_1.getGoalRunPath)(goalId, goalRunId), itemIndex));
    }
    if ((0, utils_1.isResultReady)(latestGoalRun))
        return latestGoalRun;
    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Timed out waiting for CALL-E Goal Run ${goalRunId}. Use Get with this ID to resume; a timeout does not cancel the run.`, { itemIndex });
}
function getCreateCallBody(itemIndex) {
    const task = getRequiredStringParameter.call(this, 'task', itemIndex);
    const phoneNumber = getRequiredStringParameter.call(this, 'phoneNumber', itemIndex);
    const additionalFields = this.getNodeParameter('additionalFields', itemIndex, {});
    const metadata = (0, utils_1.parseJsonObject)(additionalFields.metadata, 'Metadata');
    const legacy = this.getNode().typeVersion === 1;
    const resultSchema = (0, utils_1.parseJsonObject)(legacy ? additionalFields.resultSchema : this.getNodeParameter('resultSchema', itemIndex, ''), 'Result Schema');
    const recipientResultSchema = (0, utils_1.parseJsonObject)(additionalFields.recipientResultSchema, 'Recipient Result Schema');
    const buildBody = legacy ? utils_1.buildLegacyCreateCallBody : utils_1.buildCreateCallBody;
    return buildBody({
        task,
        phoneNumber,
        locale: optionalString(additionalFields.locale),
        region: optionalString(additionalFields.region),
        metadata,
        resultSchema,
        recipientResultSchema,
        webhookUrl: optionalString(additionalFields.webhookUrl),
    });
}
function getGoalRunBody(itemIndex) {
    const phoneNumber = getRequiredStringParameter.call(this, 'goalRunPhoneNumber', itemIndex);
    const variables = (0, utils_1.assertGoalRunVariables)((0, utils_1.parseJsonObject)(this.getNodeParameter('goalRunVariables', itemIndex, ''), 'Variables'));
    return (0, utils_1.buildGoalRunBody)({ phoneNumber, variables });
}
async function callCalleApi(method, path, itemIndex, body, qs = {}, headers = {}) {
    try {
        return await transport_1.calleApiRequest.call(this, method, path, body, qs, headers);
    }
    catch (error) {
        throw new n8n_workflow_1.NodeApiError(this.getNode(), error, { itemIndex });
    }
}
function toNodeExecutionError(error, itemIndex) {
    if (error instanceof n8n_workflow_1.NodeOperationError || error instanceof n8n_workflow_1.NodeApiError) {
        return error;
    }
    return new n8n_workflow_1.NodeOperationError(this.getNode(), error, { itemIndex });
}
function getRequiredStringParameter(name, itemIndex) {
    const value = String(this.getNodeParameter(name, itemIndex, '')).trim();
    if (!value) {
        throw new n8n_workflow_1.NodeOperationError(this.getNode(), `${name} is required.`, { itemIndex });
    }
    return value;
}
function getOptionalStringParameter(name, itemIndex) {
    const value = String(this.getNodeParameter(name, itemIndex, '')).trim();
    return value || undefined;
}
function getNumberParameter(name, itemIndex) {
    const value = Number(this.getNodeParameter(name, itemIndex));
    if (!Number.isFinite(value) || value <= 0) {
        throw new n8n_workflow_1.NodeOperationError(this.getNode(), `${name} must be greater than 0.`, {
            itemIndex,
        });
    }
    return value;
}
function getStringFromResponse(response, field, itemIndex) {
    const value = response[field];
    if (typeof value !== 'string' || !value) {
        throw new n8n_workflow_1.NodeOperationError(this.getNode(), `CALL-E response did not include ${field}.`, {
            itemIndex,
        });
    }
    return value;
}
function optionalString(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
}
//# sourceMappingURL=Calle.node.js.map