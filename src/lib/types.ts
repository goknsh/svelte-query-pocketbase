import type {
	Admin,
	Record,
	RecordListQueryParams,
	RecordQueryParams,
	RecordSubscription
} from 'pocketbase';
import type {
	CreateInfiniteQueryOptions,
	CreateQueryOptions,
	FetchQueryOptions,
	QueryKey
} from '@tanstack/svelte-query';

export interface KnownUser {
	isLoggedIn: true;
}

export interface UnknownUser {
	isLoggedIn: false;
}

export const isRecord = (test: Record | Admin | null): test is Record =>
	test !== null && 'collectionId' in test && 'collectionName' in test && 'expand' in test;

export interface InfiniteQueryPrefetchOptions<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey
> extends QueryPrefetchOptions<TQueryFnData, TError, TData, TQueryKey> {
	page?: number;
	perPage?: number;
}

export interface QueryPrefetchOptions<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey
> extends Omit<FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'queryFn'> {
	queryParams?: RecordQueryParams;
}

export interface RecordStoreOptions<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
	TRealtimeUpdate = RecordSubscription<TQueryFnData>
> extends Omit<
		| (Omit<CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'initialData'> & {
				initialData?: () => undefined;
		  })
		| (Omit<CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'initialData'> & {
				initialData: TQueryFnData | (() => TQueryFnData);
		  })
		| CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
		'queryFn'
	> {
	disableRealtime?: boolean;
	queryParams?: RecordQueryParams;
	invalidateQueryOnRealtimeError?: boolean;
	/**
	 * This callback will fire any time the realtime subscription receives an update.
	 */
	onRealtimeUpdate?: (data: TRealtimeUpdate) => void;
}

export interface CollectionStoreOptions<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
	TQueryFnDataSingular = unknown,
	TRealtimeUpdate = RecordSubscription<TQueryFnData>
> extends RecordStoreOptions<TQueryFnData, TError, TData, TQueryKey, TRealtimeUpdate> {
	queryParams?: RecordListQueryParams;
	sortFunction?: (a: TQueryFnDataSingular, b: TQueryFnDataSingular) => number;
	filterFunction?: (
		value: TQueryFnDataSingular,
		index: number,
		array: TQueryFnDataSingular[]
	) => TQueryFnDataSingular[];
	filterFunctionThisArg?: any;
}

export interface InfiniteCollectionStoreOptions<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
	TQueryFnDataSingular = unknown,
	TRealtimeUpdate = RecordSubscription<TQueryFnData>
> extends CreateInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey> {
	disableRealtime?: boolean;
	invalidateQueryOnRealtimeError?: boolean;
	keepCurrentPageOnly?: boolean;
	ignoreUnknownRecords?: boolean;
	/**
	 * This callback will fire any time the realtime subscription receives an update.
	 */
	onRealtimeUpdate?: (data: TRealtimeUpdate) => void;
	page?: number;
	perPage?: number;
	queryParams?: RecordListQueryParams;
	sortFunction?: (a: TQueryFnDataSingular, b: TQueryFnDataSingular) => number;
	filterFunction?: (
		value: TQueryFnDataSingular,
		index: number,
		array: TQueryFnDataSingular[]
	) => TQueryFnDataSingular[];
	filterFunctionThisArg?: any;
}
