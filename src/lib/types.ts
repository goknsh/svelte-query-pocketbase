import type {
	CreateInfiniteQueryOptions,
	CreateQueryOptions,
	FetchQueryOptions,
	QueryKey
} from '@tanstack/svelte-query';
import type {
	Admin,
	Record,
	RecordListQueryParams,
	RecordQueryParams,
	RecordSubscription
} from 'pocketbase';

/**
 * A known user, used in the `userStore`.
 */
export interface KnownUser {
	isLoggedIn: true;
}

/**
 * An unknown user or logged in Admin, used in the `userStore`.
 */
export interface UnknownUser {
	isLoggedIn: false;
}

/**
 * Type-narrowing to differentiate between `Record` and `Admin`.
 */
export const isRecord = (test: Record | Admin | null): test is Record =>
	test !== null && 'collectionId' in test && 'collectionName' in test && 'expand' in test;

/**
 * Interface for the options parameter in `createRecordQueryPrefetch`.
 */
export interface QueryPrefetchOptions<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey
> extends Omit<FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'queryFn'> {
	queryParams?: RecordQueryParams;
}

/**
 * Interface for the options parameter in `createCollectionQueryPrefetch`.
 */
export interface CollectionQueryPrefetchOptions<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey
> extends QueryPrefetchOptions<TQueryFnData, TError, TData, TQueryKey> {
	queryParams?: RecordListQueryParams;
}

/**
 * Interface for the options parameter in `infiniteCollectionQueryPrefetch`.
 */
export interface InfiniteQueryPrefetchOptions<
	TQueryFnData = unknown,
	TError = unknown,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey
> extends CollectionQueryPrefetchOptions<TQueryFnData, TError, TData, TQueryKey> {
	page?: number;
	perPage?: number;
}

/**
 * Interface for the options parameter in `createRecordQuery`.
 */
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
	debug?: boolean;
}

/**
 * Interface for the options parameter in `createCollectionQuery`.
 */
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
	) => boolean;
	filterFunctionThisArg?: any;
}

/**
 * Interface for the options parameter in `createInfiniteCollectionQuery`.
 */
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
	) => boolean;
	filterFunctionThisArg?: any;
	debug?: boolean;
}
