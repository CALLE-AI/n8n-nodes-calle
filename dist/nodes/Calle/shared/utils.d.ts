export type JsonObject = Record<string, unknown>;
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
export type CalleBaseUrlValidationResult = {
    ok: true;
    baseUrl: string;
} | {
    ok: false;
    message: string;
};
export declare function assertValidE164PhoneNumber(phoneNumber: string): string;
export declare function parseJsonObject(value: unknown, fieldName: string): JsonObject | undefined;
export declare function buildLegacyCreateCallBody(input: CreateCallBodyInput): LegacyCreateCallBody;
export declare function buildCreateCallBody(input: CreateCallBodyInput): CreateCallBody;
export declare function assertGoalRunVariables(variables: JsonObject | undefined): JsonObject | undefined;
export declare function buildGoalRunBody(input: GoalRunBodyInput): GoalRunBody;
export declare function isResultReady(call: JsonObject): boolean;
export declare function getGoalPath(goalId: string): string;
export declare function getGoalRunPath(goalId: string, goalRunId: string): string;
export declare function assertRequiredIdempotencyKey(value: string): string;
export declare function isTerminalCallStatus(status: string): boolean;
export declare function maskPhoneNumber(phoneNumber: string): string;
export declare function validateCalleBaseUrl(baseUrl: unknown): CalleBaseUrlValidationResult;
export declare function getPollingSleepMs(pollingInterval: number, deadline: number, now?: number): number;
