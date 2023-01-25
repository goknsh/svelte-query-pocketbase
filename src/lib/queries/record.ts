import {
	createQuery,
	useQueryClient,
	type CreateQueryResult,
	type FetchQueryOptions,
	type QueryKey
} from '@tanstack/svelte-query';

import type Client from 'pocketbase';
import type {
	ClientResponseError,
	Record,
	RecordQueryParams,
	RecordSubscription
} from 'pocketbase';

import { collectionKeys } from '../query-key-factory';
import { realtimeStoreExpand } from '../internal';
import type { QueryPrefetchOptions, RecordStoreOptions } from '../types';

const createRecordQueryCallback = async <T extends Record = Record>(
	item: T | null,
	subscription: RecordSubscription<T>,
	collection: ReturnType<Client['collection']>,
	queryParams: RecordQueryParams | undefined = undefined
) => {
	switch (subscription.action) {
		case 'update':
			return await realtimeStoreExpand(collection, subscription.record, queryParams?.expand);
		case 'create':
			return await realtimeStoreExpand(collection, subscription.record, queryParams?.expand);
		case 'delete':
			return null;
		default:
			return item;
	}
};

export const createRecordQueryInitialData = <T extends Record = Record>(
	collection: ReturnType<Client['collection']>,
	id: string,
	{ queryParams = undefined }: { queryParams?: RecordQueryParams }
): Promise<T> => collection.getOne<T>(id, queryParams);

export const createRecordQueryPrefetch = <
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
	}: QueryPrefetchOptions<T, ClientResponseError, T, TQueryKey> = {}
): FetchQueryOptions<T, ClientResponseError, T, TQueryKey> => ({
	staleTime,
	queryKey,
	...options,
	queryFn: async () => await createRecordQueryInitialData<T>(collection, id, { queryParams })
});

/**
 * Readable async Svelte store wrapper around a Pocketbase record that updates in realtime.
 *
 * Notes:
 * - When running server-side, this store returns the "empty version" version of this store, i.e. `undefined`.
 * - If a delete action is received via the realtime subscription, the store's value changes to `undefined`.
 *
 * @param collection Collection the record is a part of whose updates to fetch in realtime.
 * @param id ID of the Pocketbase record which will be updated in realtime.
 * @param [options.queryParams] Pocketbase query paramteres to apply on initial data fetch and everytime an update is received via the realtime subscription. **Only `expand` field is used when an action is received via the realtime subscription.**
 * @param [options.initial] If provided, skips initial data fetching and uses the provided value instead. Useful if you want to perform initial fetch during SSR and initialize a realtime subscription client-side.
 * @param [options.disableRealtime] Only performs the initial fetch and does not subscribe to anything. This has an effect only when provided client-side.
 */
export const createRecordQuery = <T extends Record = Record, TQueryKey extends QueryKey = QueryKey>(
	collection: ReturnType<Client['collection']>,
	id: string,
	{
		staleTime = Infinity,
		refetchOnReconnect = 'always',
		queryParams = undefined,
		queryKey = collectionKeys({
			collection,
			id,
			...(queryParams && { queryParams })
		}) as unknown as TQueryKey,
		enabled = true,
		disableRealtime = false,
		invalidateQueryOnRealtimeError = true,
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
						createRecordQueryCallback(
							queryClient.getQueryData<T | null>(queryKey) ?? null,
							data,
							collection,
							queryParams
						)
							.then((r) => {
								console.log('setting data to:', r);
								queryClient.setQueryData<T | null>(queryKey, () => r);
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
							`${collection.collectionIdOrName}/${id}`
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
