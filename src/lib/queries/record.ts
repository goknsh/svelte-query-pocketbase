import {
	createQuery,
	type QueryClient,
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

const createRecordQueryCallback = async <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	queryClient: QueryClient,
	queryKey: TQueryKey,
	subscription: RecordSubscription<T>,
	collection: ReturnType<Client['collection']>,
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

export const createRecordQueryInitialData = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>
>(
	collection: ReturnType<Client['collection']>,
	id: string,
	{ queryParams = undefined }: { queryParams?: RecordQueryParams }
): Promise<T> => collection.getOne<T>(id, queryParams);

export const createRecordQueryPrefetch = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
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

export const createRecordQuery = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: ReturnType<Client['collection']>,
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
								console.log(
									`(R) ${JSON.stringify(queryKey)}: updating with realtime action:`,
									data.action,
									data.record.id
								);
							})
							.catch((e) => {
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
			console.log(`(R) ${JSON.stringify(queryKey)}: subscribing to changes...`);
			let unsubscriber = store.subscribe(...args);
			return () => {
				console.log(`(R) ${JSON.stringify(queryKey)}: unsubscribing from store.`);
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
						console.log(
							`(R) ${JSON.stringify(
								queryKey
							)}: no realtime listeners or query has queryParams, marking query as stale.`
						);
						// todo: correctly derive queryKey to mark as invalid
						// todo: ensure that if a $store was passed into filterFunction,
						// only the value when query was created with is used even after the $store's value changes
						queryClient.invalidateQueries({ queryKey, exact: true });
					}
				})();
				return unsubscriber();
			};
		}
	};
};
