import {
	createQuery,
	useQueryClient,
	type CreateQueryResult,
	type FetchQueryOptions,
	type QueryClient,
	type QueryKey
} from '@tanstack/svelte-query';

import type {
	ClientResponseError,
	Record,
	RecordQueryParams,
	RecordService,
	RecordSubscription
} from 'pocketbase';

import { realtimeStoreExpand } from '../internal';
import { collectionKeys } from '../query-key-factory';
import type { QueryPrefetchOptions, RecordStoreOptions } from '../types';

const createRecordQueryCallback = async <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	queryClient: QueryClient,
	queryKey: TQueryKey,
	subscription: RecordSubscription<T>,
	collection: RecordService,
	queryParams: RecordQueryParams | undefined = undefined
) => {
	let data = queryClient.getQueryData<T | null>(queryKey);

	let expandedRecord = subscription.record;
	if (data ? new Date(expandedRecord.updated) > new Date(data.updated) : true) {
		if (
			(subscription.action === 'update' || subscription.action === 'create') &&
			queryParams?.expand
		) {
			expandedRecord = await realtimeStoreExpand(
				collection,
				subscription.record,
				queryParams.expand
			);
			// get data again because the cache could've changed while we were awaiting the expand
			data = queryClient.getQueryData<T | null>(queryKey);
		}

		switch (subscription.action) {
			case 'update':
			case 'create':
				queryClient.setQueryData(queryKey, () => expandedRecord);
				break;
			case 'delete':
				queryClient.setQueryData(queryKey, () => null);
				break;
		}
	}
};

/**
 * Meant for SSR use, simply returns the record from a collection. See [TanStack's documentation](https://tanstack.com/query/v4/docs/svelte/ssr#using-initialdata) and this project's README.md for some examples.
 *
 * @param collection The collection from which to get the record.
 * @param id The `id` of the record to get from the collection.
 * @param [options.queryParams] The query params that will be passed on to `getOne`.
 * @returns The initial data required for a record query, i.e. the Pocketbase record.
 */
export const createRecordQueryInitialData = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>
>(
	collection: RecordService,
	id: string,
	{ queryParams = undefined }: { queryParams?: RecordQueryParams }
): Promise<T> => collection.getOne<T>(id, queryParams);

/**
 * Meant for SSR use, allows for prefetching queries on the server so that data is already available in the cache, and no initial fetch occurs client-side. See [TanStack's documentation](https://tanstack.com/query/v4/docs/svelte/ssr#using-prefetchquery) and this project's README.md for some examples.
 *
 * @param collection The collection from which to get the record.
 * @param id The `id` of the record to get from the collection.
 * @param [options.queryParams] The query params are simply passed on to `getOne` and if the `expand` key is provided, the record is expanded every time a realtime update is received.
 * @param [options.queryKey] Provides the query key option for TanStack Query. By default, uses the `collectionKeys` function from this package.
 * @param [options.staleTime] Provides the stale time option for TanStack Query. By default, `Infinity` since the query receives realtime updates. Note that the package will take care of automatically marking the query as stale when the last subscriber unsubscribes from this query.
 * @param [options] The rest of the options are passed to the `prefetchQuery` function from TanStack Query, this library has no defaults for them.
 * @returns The fully-configured options object that is ready to be passed on to the `prefetchQuery` function from TanStack Query.
 */
export const createRecordQueryPrefetch = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: RecordService,
	id: string,
	{
		staleTime = Infinity,
		queryParams = undefined,
		queryKey = collectionKeys({
			collection,
			id,
			...(queryParams && queryParams)
		}) as unknown as TQueryKey,
		...options
	}: QueryPrefetchOptions<T, ClientResponseError, T, TQueryKey> = {}
): FetchQueryOptions<T, ClientResponseError, T, TQueryKey> => ({
	staleTime,
	queryKey,
	...options,
	queryFn: async () => await createRecordQueryInitialData<T>(collection, id, { queryParams })
});

/**
 * Creates a TanStack Query that updates a Pocketbase record in realtime.
 *
 * Notes:
 * - If a `delete` action is received via the realtime subscription, this query's data value changes to `null`.
 * - When running server-side, the realtime subscription will not be created.
 *
 * @param collection The collection from which to get the record.
 * @param id The `id` of the record to get from the collection.
 * @param [options.queryParams] The query params are simply passed on to `getOne` and if the `expand` key is provided, the record is expanded every time a realtime update is received.
 * @param [options.disableRealtime] Provides an option to disable realtime updates to the Pocketbase record. By default, `false` since we want the Pocketbase record to be updated in realtime. If set to `true`, a realtime subscription to the Pocketbase server is never sent. Don't forget to set `options.staleTime` to a more appropriate value than `Infinity` you disable realtime updates.
 * @param [options.invalidateQueryOnRealtimeError] Provides an option to invalidate the query if a realtime error occurs. By default, `true` since if a realtime error occurs, the query's data would be stale.
 * @param [options.onRealtimeUpdate] This function is called with the realtime action every time an realtime action is received.
 * @param [options.queryKey] Provides the query key option for TanStack Query. By default, uses the `collectionKeys` function from this package.
 * @param [options.staleTime] Provides the stale time option for TanStack Query. By default, `Infinity` since the query receives realtime updates. Note that the package will take care of automatically marking the query as stale when the last subscriber unsubscribes from this query.
 * @param [options.refetchOnReconnect] Provides the refetch on reconnection option for TanStack Query. By default, `'always'` since the query we wouldn't be receiving realtime updates if connection was lost.
 * @param [options.enable] Provides the enabled option for TanStack Query. By default, `true` since we want the query to be enabled. If set to `false`, this also disables realtime updates to the Pocketbase record.
 * @param [options] The rest of the options are passed to the `createQuery` function from TanStack Query, this library has no defaults for them.
 * @returns The same object as TanStack Query's `createQuery`, with a Pocketbase record that updates in realtime.
 */
export const createRecordQuery = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: RecordService,
	id: string,
	{
		staleTime = Infinity,
		refetchOnReconnect = 'always',
		queryParams = undefined,
		queryKey = collectionKeys({
			collection,
			id,
			...(queryParams && queryParams)
		}) as unknown as TQueryKey,
		enabled = true,
		disableRealtime = false,
		invalidateQueryOnRealtimeError = true,
		debug = false,
		...options
	}: RecordStoreOptions<
		T | null,
		ClientResponseError,
		T | null,
		TQueryKey,
		RecordSubscription<T>
	> = {}
): CreateQueryResult<T | null, ClientResponseError> => {
	const queryClient = useQueryClient();

	const store = createQuery<T | null, ClientResponseError, T | null, TQueryKey>({
		staleTime,
		refetchOnReconnect,
		queryKey,
		enabled,
		...options,
		queryFn: async () => await createRecordQueryInitialData<T>(collection, id, { queryParams })
	});

	const unsubscribePromise =
		disableRealtime || !enabled || import.meta.env.SSR
			? async () => {}
			: collection
					.subscribe<T>(id, (data) => {
						createRecordQueryCallback(queryClient, queryKey, data, collection, queryParams)
							.then(() => {
								debug &&
									console.log(
										`(R) ${JSON.stringify(queryKey)}: updating with realtime action:`,
										data.action,
										data.record.id
									);
							})
							.catch((e) => {
								debug &&
									console.log(
										`(R) ${JSON.stringify(queryKey)}: invalidating query due to callback error:`,
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
								`(R) [${JSON.stringify(
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
			debug && console.log(`(R) ${JSON.stringify(queryKey)}: subscribing to changes...`);
			let unsubscriber = store.subscribe(...args);
			return () => {
				debug && console.log(`(R) ${JSON.stringify(queryKey)}: unsubscribing from store.`);
				(async () => {
					await (
						await unsubscribePromise
					)();
					if (
						!collection.client.realtime['hasSubscriptionListeners'](
							`${collection.collectionIdOrName}/${id}`
						) ||
						Object.keys(queryParams ?? {}).length > 0
					) {
						debug &&
							console.log(
								`(R) ${JSON.stringify(
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
