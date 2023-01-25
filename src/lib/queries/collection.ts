import {
	createQuery,
	useQueryClient,
	type CreateQueryResult,
	type FetchQueryOptions,
	type QueryKey
} from '@tanstack/svelte-query';

import type Client from 'pocketbase';
import type {
	Record,
	RecordListQueryParams,
	RecordSubscription,
	ClientResponseError
} from 'pocketbase';

import { collectionKeys } from '../query-key-factory';
import { realtimeStoreExpand } from '../internal';
import type { CollectionStoreOptions, QueryPrefetchOptions } from '../types';

const collectionStoreCallback = async <T extends Record = Record>(
	list: T[],
	subscription: RecordSubscription<T>,
	collection: ReturnType<Client['collection']>,
	queryParams: RecordListQueryParams | undefined = undefined
) => {
	switch (subscription.action) {
		case 'update':
			subscription.record = await realtimeStoreExpand(
				collection,
				subscription.record,
				queryParams?.expand
			);
			return list.map((item) => (item.id === subscription.record.id ? subscription.record : item));
		case 'create':
			subscription.record = await realtimeStoreExpand(
				collection,
				subscription.record,
				queryParams?.expand
			);
			return [...list, subscription.record];
		case 'delete':
			return list.filter((item) => item.id !== subscription.record.id);
		default:
			return list;
	}
};

export const createCollectionQueryInitialData = <T extends Record = Record>(
	collection: ReturnType<Client['collection']>,
	{ queryParams = undefined }: { queryParams?: RecordListQueryParams }
): Promise<Array<T>> => collection.getFullList<T>(undefined, queryParams);

export const createCollectionQueryPrefetch = <
	T extends Record = Record,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: ReturnType<Client['collection']>,
	id: string,
	{
		staleTime = Infinity,
		queryParams = undefined,
		queryKey = collectionKeys({
			collection,
			id,
			...(queryParams && { queryParams })
		}) as unknown as TQueryKey,
		...options
	}: QueryPrefetchOptions<Array<T>, ClientResponseError, Array<T>, TQueryKey> = {}
): FetchQueryOptions<Array<T>, ClientResponseError, Array<T>, TQueryKey> => ({
	staleTime,
	queryKey,
	...options,
	queryFn: async () => await createCollectionQueryInitialData<T>(collection, { queryParams })
});

/**
 * Readable async Svelte store wrapper around an entire Pocketbase collection that updates in realtime.
 *
 * Notes:
 * - When running server-side, this store returns the "empty version" version of this store, i.e. an empty array.
 * - Create action received by the realtime subscription are added to the end of the returned store.
 * - When an action is received via the realtime subscription, `sortFunction` runs first, then `filterFunction` runs.
 * - This version of the collection store does not have pagination. Use `paginatedCollectionStore` if you want pagination.
 *
 * @param collection Collection whose updates to fetch in realtime.
 * @param [options.queryParams] Pocketbase query parameters to apply on inital data fetch. **Only `expand` field is used when an action is received via the realtime subscription. Use `sortFunction` and `filterFunction` to apply sorting and filtering on actions received via the realtime subscription.**
 * @param [options.sortFunction] `compareFn` from `Array.prototype.sort` that runs when an action is received via the realtime subscription. This is used since realtime subscriptions does not support `sort` in `queryParams`.
 * @param [options.filterFunction] `predicate` from `Array.prototype.filter` that runs when an action is received via the realtime subscription. This is used since realtime subscriptions does not support `filter` in `queryParams`.
 * @param [options.filterFunctionThisArg] `thisArg` from `Array.prototype.filter` that runs when an action is received via the realtime subscription. This is used since realtime subscriptions does not support `filter` in `queryParams`.
 * @param [options.initial] If provided, skips initial data fetching and uses the provided value instead. Useful if you want to perform initial fetch during SSR and initialize a realtime subscription client-side.
 * @param [options.disableRealtime] Only performs the initial fetch and does not subscribe to anything. This has an effect only when provided client-side.
 */
export const createCollectionQuery = <
	T extends Record = Record,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: ReturnType<Client['collection']>,
	{
		staleTime = Infinity,
		refetchOnReconnect = 'always',
		queryParams = undefined,
		queryKey = collectionKeys({
			collection,
			...(queryParams && { queryParams })
		}) as unknown as TQueryKey,
		enabled = true,
		disableRealtime = false,
		invalidateQueryOnRealtimeError = true,
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
							queryClient.getQueryData<T[]>(queryKey) ?? [],
							data,
							collection,
							queryParams
						)
							.then((r) => {
								console.log('setting data to:', r);
								queryClient.setQueryData<T[]>(queryKey, () =>
									options.filterFunction
										? r
												.sort(options.sortFunction)
												.filter(options.filterFunction, options.filterFunctionThisArg)
										: r.sort(options.sortFunction)
								);
							})
							.catch(() => {
								console.log('invalidating query');
								if (invalidateQueryOnRealtimeError) {
									queryClient.invalidateQueries({ queryKey, exact: true });
								}
							});
						options.onRealtimeUpdate?.(data);
					})
					.catch(() => {
						console.log('invalidating query');
						if (invalidateQueryOnRealtimeError) {
							queryClient.invalidateQueries({ queryKey, exact: true });
						}
						return async () => {};
					});

	return {
		subscribe: (...args) => {
			console.log('subscribing!');
			let unsubscriber = store.subscribe(...args);
			return () => {
				console.log('unsubscribing!');
				(async () => {
					await (
						await unsubscribePromise
					)();
					if (
						!collection.client.realtime['hasSubscriptionListeners'](
							`${collection.collectionIdOrName}/*`
						)
					) {
						console.log('no listeners. marking stale.');
						queryClient.invalidateQueries({ queryKey, exact: true });
					}
				})();
				return unsubscriber();
			};
		}
	};
};
