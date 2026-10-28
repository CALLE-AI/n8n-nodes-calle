import { type IExecuteFunctions, type ILoadOptionsFunctions, type INodeListSearchResult, type INodeExecutionData, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
export declare class Calle implements INodeType {
    methods: {
        listSearch: {
            getPublishedGoals(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string): Promise<INodeListSearchResult>;
        };
    };
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
