import {
	createQuery,
	useQueryClient,
	type CreateQueryResult,
	type FetchQueryOptions,
	type QueryClient,
	type QueryKey
} from '@tanstack/svelte-query';

import { produce, setAutoFreeze, type Draft } from 'immer';

import type {
	ClientResponseError,
	Record,
	RecordListQueryParams,
	RecordService,
	RecordSubscription
} from 'pocketbase';

import { realtimeStoreExpand } from '../internal';
import { collectionKeys } from '../query-key-factory';
import type { CollectionQueryPrefetchOptions, CollectionStoreOptions } from '../types';

setAutoFreeze(false);

const collectionStoreCallback = async <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	queryClient: QueryClient,
	queryKey: TQueryKey,
	subscription: RecordSubscription<T>,
	collection: RecordService,
	queryParams: RecordListQueryParams | undefined = undefined,
	sortFunction?: (a: T, b: T) => number,
	filterFunction?: (value: T, index: number, array: T[]) => boolean,
	filterFunctionThisArg?: any
) => {
	let data = queryClient.getQueryData<T[]>(queryKey) ?? [];

	let expandedRecord = subscription.record;
	if (
		(subscription.action === 'update' || subscription.action === 'create') &&
		queryParams?.expand
	) {
		expandedRecord = await realtimeStoreExpand(collection, subscription.record, queryParams.expand);
		// get data again because the cache could've changed while we were awaiting the expand
		data = queryClient.getQueryData<T[]>(queryKey) ?? [];
	}

	let actionIgnored = false;
	switch (subscription.action) {
		case 'update':
		case 'create':
			data = produce(data, (draft) => {
				let updateIndex = draft.findIndex((item) => item.id === expandedRecord.id);
				if (updateIndex !== -1) {
					if (new Date(expandedRecord.updated) >= new Date(draft[updateIndex].updated)) {
						draft[updateIndex] = expandedRecord as Draft<T>;
					} else {
						actionIgnored = true;
					}
				} else {
					draft.push(expandedRecord as Draft<T>);
				}
			});
			break;
		case 'delete':
			data = produce(data, (draft) => {
				let deleteIndex = draft.findIndex((item) => item.id === expandedRecord.id);
				if (deleteIndex !== -1) {
					if (new Date(expandedRecord.updated) >= new Date(draft[deleteIndex].updated)) {
						draft.splice(deleteIndex, 1);
					} else {
						actionIgnored = true;
					}
				}
			});
			break;
	}

	if (!actionIgnored) {
		if (subscription.action !== 'delete') {
			if (filterFunction) {
				data = produce(
					data,
					(draft) => (draft as T[]).filter(filterFunction, filterFunctionThisArg) as Draft<T>[]
				);
			}
			if (sortFunction) {
				data.sort(sortFunction);
			}
		}

		queryClient.setQueryData<T[]>(queryKey, data);
	}
};

/**
 * Meant for SSR use, simply returns all the records from a collection. See [TanStack's documentation](https://tanstack.com/query/v4/docs/svelte/ssr#using-initialdata) and this project's README.md for some examples.
 *
 * @param collection The collection from which to get all the records.
 * @param [options.queryParams] The query params that will be passed on to `getFullList`.
 * @returns The initial data required for a collection query, i.e. an array of Pocketbase records.
 */
export const createCollectionQueryInitialData = async <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>
>(
	collection: RecordService,
	{ queryParams = undefined }: { queryParams?: RecordListQueryParams }
): Promise<Array<T>> => [...(await collection.getFullList<T>(queryParams))];

/**
 * Meant for SSR use, allows for prefetching queries on the server so that data is already available in the cache, and no initial fetch occurs client-side. See [TanStack's documentation](https://tanstack.com/query/v4/docs/svelte/ssr#using-prefetchquery) and this project's README.md for some examples.
 *
 * @param collection The collection from which to get all the records.
 * @param [options.queryParams] The query params are simply passed on to `getFullList` for the initial data fetch, and `getOne` for realtime updates. If the `expand` key is provided, the record is expanded every time a realtime update is received.
 * @param [options.queryKey] Provides the query key option for TanStack Query. By default, uses the `collectionKeys` function from this package.
 * @param [options.staleTime] Provides the stale time option for TanStack Query. By default, `Infinity` since the query receives realtime updates. Note that the package will take care of automatically marking the query as stale when the last subscriber unsubscribes from this query.
 * @param [options] The rest of the options are passed to the `prefetchQuery` function from TanStack Query, this library has no defaults for them.
 * @returns The fully-configured options object that is ready to be passed on to the `prefetchQuery` function from TanStack Query.
 */
export const createCollectionQueryPrefetch = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: RecordService,
	{
		staleTime = Infinity,
		queryParams = undefined,
		queryKey = collectionKeys({
			collection,
			...(queryParams && queryParams)
		}) as unknown as TQueryKey,
		...options
	}: CollectionQueryPrefetchOptions<Array<T>, ClientResponseError, Array<T>, TQueryKey> = {}
): FetchQueryOptions<Array<T>, ClientResponseError, Array<T>, TQueryKey> => ({
	staleTime,
	queryKey,
	...options,
	queryFn: async () => await createCollectionQueryInitialData<T>(collection, { queryParams })
});

/**
 * Creates a TanStack Query that updates an array of Pocketbase records in realtime.
 *
 * Notes:
 * - When running server-side, the realtime subscription will not be created.
 * - When a realtime update is received, after the action is handled, the `filterFunction` runs first, then `sortFunction` runs.
 * - If a `create` action is received via the realtime subscription, the new record is added to the end of the query's data array before the `filterFunction` and `sortFunction` run.
 *
 * @param collection The collection from which to get all the records.
 * @param [options.queryParams] The query params are simply passed on to `getFullList` for the initial data fetch, and `getOne` for realtime updates. If the `expand` key is provided, the record is expanded every time a realtime update is received.
 * @param [options.sortFunction] `compareFn` from `Array.prototype.sort` that runs when an action is received via the realtime subscription. This is used since Pocketbase realtime subscriptions does not support `sort` in `queryParams`.
 * @param [options.filterFunction] `predicate` from `Array.prototype.filter` that runs when an action is received via the realtime subscription. This is used since Pocketbase realtime subscriptions does not support `filter` in `queryParams`.
 * @param [options.filterFunctionThisArg] `thisArg` from `Array.prototype.filter` that runs when an action is received via the realtime subscription. This is used since Pocketbase realtime subscriptions does not support `filter` in `queryParams`.
 * @param [options.disableRealtime] Provides an option to disable realtime updates to the array of Pocketbase records. By default, `false` since we want the array of Pocketbase records to be updated in realtime. If set to `true`, a realtime subscription to the Pocketbase server is never sent. Don't forget to set `options.staleTime` to a more appropriate value than `Infinity` you disable realtime updates.
 * @param [options.invalidateQueryOnRealtimeError] Provides an option to invalidate the query if a realtime error occurs. By default, `true` since if a realtime error occurs, the query's data would be stale.
 * @param [options.onRealtimeUpdate] This function is called with the realtime action every time an realtime action is received.
 * @param [options.queryKey] Provides the query key option for TanStack Query. By default, uses the `collectionKeys` function from this package.
 * @param [options.staleTime] Provides the stale time option for TanStack Query. By default, `Infinity` since the query receives realtime updates. Note that the package will take care of automatically marking the query as stale when the last subscriber unsubscribes from this query.
 * @param [options.refetchOnReconnect] Provides the refetch on reconnection option for TanStack Query. By default, `'always'` since the query we wouldn't be receiving realtime updates if connection was lost.
 * @param [options.enable] Provides the enabled option for TanStack Query. By default, `true` since we want the query to be enabled. If set to `false`, this also disables realtime updates to the Pocketbase record.
 * @param [options] The rest of the options are passed to the `createQuery` function from TanStack Query, this library has no defaults for them.
 * @returns The same object as TanStack Query's `createQuery`, with an array of Pocketbase records that updates in realtime.
 */
export const createCollectionQuery = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: RecordService,
	{
		staleTime = Infinity,
		refetchOnReconnect = 'always',
		queryParams = undefined,
		queryKey = collectionKeys({
			collection,
			...(queryParams && queryParams)
		}) as unknown as TQueryKey,
		enabled = true,
		disableRealtime = false,
		invalidateQueryOnRealtimeError = true,
		debug = false,
		...options
	}: CollectionStoreOptions<T[], ClientResponseError, T[], TQueryKey, T, RecordSubscription<T>> = {}
): CreateQueryResult<T[], ClientResponseError> => {
	const queryClient = useQueryClient();

	const store = createQuery<T[], ClientResponseError, T[], TQueryKey>({
		staleTime,
		refetchOnReconnect,
		queryKey,
		enabled,
		...options,
		queryFn: async () => await createCollectionQueryInitialData<T>(collection, { queryParams })
	});

	const unsubscribePromise =
		disableRealtime || !enabled || import.meta.env.SSR
			? async () => {}
			: collection
					.subscribe<T>('*', (data) => {
						collectionStoreCallback(
							queryClient,
							queryKey,
							data,
							collection,
							queryParams,
							options.sortFunction,
							options.filterFunction,
							options.filterFunctionThisArg
						)
							.then(() => {
								debug &&
									console.log(
										`(C) ${JSON.stringify(queryKey)}: updating with realtime action:`,
										data.action,
										data.record.id
									);
							})
							.catch((e) => {
								debug &&
									console.log(
										`(C) ${JSON.stringify(queryKey)}: invalidating query due to callback error:`,
										e
									);
								if (invalidateQueryOnRealtimeError) {
									queryClient.invalidateQueries({ queryKey, exact: true });
								}
							});
						options.onRealtimeUpdate?.(data);
					})
					.catch((e) => {
						debug &&
							console.log(
								`(C) [${JSON.stringify(
									queryKey
								)}]: invalidating query due to realtime subscription error:`,
								e
							);
						if (invalidateQueryOnRealtimeError) {
							queryClient.invalidateQueries({ queryKey, exact: true });
						}
						return async () => {};
					});

	return {
		subscribe: (...args) => {
			debug && console.log(`(C) ${JSON.stringify(queryKey)}: subscribing to changes...`);
			let unsubscriber = store.subscribe(...args);
			return () => {
				debug && console.log(`(C) ${JSON.stringify(queryKey)}: unsubscribing from store.`);
				(async () => {
					await (
						await unsubscribePromise
					)();
					if (
						!collection.client.realtime['hasSubscriptionListeners'](
							collection.collectionIdOrName
						) ||
						Object.keys(queryParams ?? {}).length > 0
					) {
						debug &&
							console.log(
								`(C) ${JSON.stringify(
									queryKey
								)}: no realtime listeners or query has queryParams, marking query as stale.`
							);
						queryClient.invalidateQueries({ queryKey, exact: true });
					}
				})();
				return unsubscriber();
			};
		}
	};
};
