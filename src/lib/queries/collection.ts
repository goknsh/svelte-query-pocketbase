import {
	createQuery,
	type QueryClient,
	useQueryClient,
	type CreateQueryResult,
	type FetchQueryOptions,
	type QueryKey
} from '@tanstack/svelte-query';

import { setAutoFreeze, produce, type Draft } from 'immer';

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

setAutoFreeze(false);

const collectionStoreCallback = async <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	queryClient: QueryClient,
	queryKey: TQueryKey,
	subscription: RecordSubscription<T>,
	collection: ReturnType<Client['collection']>,
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

export const createCollectionQueryInitialData = async <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>
>(
	collection: ReturnType<Client['collection']>,
	{ queryParams = undefined }: { queryParams?: RecordListQueryParams }
): Promise<Array<T>> => [...(await collection.getFullList<T>(undefined, queryParams))];

export const createCollectionQueryPrefetch = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: ReturnType<Client['collection']>,
	{
		staleTime = Infinity,
		queryParams = undefined,
		queryKey = collectionKeys({
			collection,
			...(queryParams && queryParams)
		}) as unknown as TQueryKey,
		...options
	}: QueryPrefetchOptions<Array<T>, ClientResponseError, Array<T>, TQueryKey> = {}
): FetchQueryOptions<Array<T>, ClientResponseError, Array<T>, TQueryKey> => ({
	staleTime,
	queryKey,
	...options,
	queryFn: async () => await createCollectionQueryInitialData<T>(collection, { queryParams })
});

export const createCollectionQuery = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: ReturnType<Client['collection']>,
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
								console.log(
									`(C) ${JSON.stringify(queryKey)}: updating with realtime action:`,
									data.action,
									data.record.id
								);
							})
							.catch((e) => {
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
			console.log(`(C) ${JSON.stringify(queryKey)}: subscribing to changes...`);
			let unsubscriber = store.subscribe(...args);
			return () => {
				console.log(`(C) ${JSON.stringify(queryKey)}: unsubscribing from store.`);
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
