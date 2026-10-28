import type { IDataObject, IExecuteFunctions, IHttpRequestMethods, ILoadOptionsFunctions } from 'n8n-workflow';
export declare function calleApiRequest(this: IExecuteFunctions | ILoadOptionsFunctions, method: IHttpRequestMethods, path: string, body?: IDataObject, qs?: IDataObject, headers?: IDataObject): Promise<any>;
