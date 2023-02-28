import type Client from 'pocketbase';
import {
	ListResult,
	type Record,
	type RecordSubscription,
	type RecordListQueryParams,
	type ClientResponseError
} from 'pocketbase';
import {
	createInfiniteQuery,
	useQueryClient,
	type FetchQueryOptions,
	type QueryKey,
	type InfiniteData,
	type CreateInfiniteQueryResult,
	type QueryClient
} from '@tanstack/svelte-query';

import { setAutoFreeze, produce, type Draft } from 'immer';

import { realtimeStoreExpand } from '../internal';
import { collectionKeys } from '../query-key-factory';
import type { InfiniteCollectionStoreOptions, InfiniteQueryPrefetchOptions } from '../types';

setAutoFreeze(false);

const infiniteCollectionStoreCallback = async <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	queryClient: QueryClient,
	queryKey: TQueryKey,
	subscription: RecordSubscription<T>,
	collection: ReturnType<Client['collection']>,
	perPage: number,
	queryParams: RecordListQueryParams | undefined = undefined,
	sortFunction?: (a: T, b: T) => number,
	filterFunction?: (value: T, index: number, array: T[]) => boolean,
	filterFunctionThisArg?: any
) => {
	let data = queryClient.getQueryData<InfiniteData<ListResult<T>>>(queryKey);
	if (data) {
		let expandedRecord = subscription.record;
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
			data = queryClient.getQueryData<InfiniteData<ListResult<T>>>(queryKey);
		}

		if (data) {
			let allItems = data.pages.flatMap((page) => page.items);

			let actionIgnored = false;
			let updateIndex = -1;
			let deleteIndex = -1;
			switch (subscription.action) {
				case 'update':
				case 'create':
					allItems = produce(allItems, (draft) => {
						updateIndex = draft.findIndex((item) => item.id === expandedRecord.id);
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
					allItems = produce(allItems, (draft) => {
						deleteIndex = draft.findIndex((item) => item.id === expandedRecord.id);
						if (new Date(expandedRecord.updated) >= new Date(draft[deleteIndex].updated)) {
							draft.splice(deleteIndex, 1);
						} else {
							actionIgnored = true;
						}
					});
					break;
			}

			if (!actionIgnored) {
				let itemUnawareDelete = false;
				let reduceTotalItemsBy = 0;
				if (updateIndex === -1 && subscription.action === 'create') {
					reduceTotalItemsBy = -1;
				} else if (
					deleteIndex !== -1 ||
					(subscription.action === 'delete' && filterFunction
						? [expandedRecord].filter(filterFunction, filterFunctionThisArg).length === 0
						: true)
				) {
					reduceTotalItemsBy = 1;
					if (deleteIndex === -1) {
						itemUnawareDelete = true;
					}
				}

				if (filterFunction) {
					const allItemsCountBeforeFilter = allItems.length;
					allItems = produce(
						allItems,
						(draft) => (draft as T[]).filter(filterFunction, filterFunctionThisArg) as Draft<T>[]
					);
					const allItemsCountAfterFilter = allItems.length;
					if (allItemsCountAfterFilter < allItemsCountBeforeFilter) {
						reduceTotalItemsBy -= allItemsCountBeforeFilter - allItemsCountAfterFilter;
					}
				}

				let positionBeforeSort = -1;
				let positionAfterSort = -1;
				if (sortFunction && subscription.action !== 'delete') {
					positionBeforeSort = allItems.findIndex((item) => item.id === expandedRecord.id);
					allItems.sort(sortFunction);
					positionAfterSort = allItems.findIndex((item) => item.id === expandedRecord.id);
				}

				let totalItemsWeHave = 0;
				let totalItemsInDatabase = 0;
				data = produce(data, (draft) => {
					for (let index = 0; index < draft.pages.length; index++) {
						draft.pages[index].totalItems -= reduceTotalItemsBy;
						draft.pages[index].totalPages = Math.ceil(
							draft.pages[index].totalItems / draft.pages[index].perPage
						);
						draft.pages[index].items = allItems.splice(0, draft.pages[index].perPage) as Draft<T[]>;
						if (draft.pages[index].totalItems === 0) {
							draft.pages[index].totalPages = 0;
						} else if (draft.pages[index].totalItems === 1) {
							draft.pages[index].totalPages = 1;
						}
						totalItemsWeHave += draft.pages[index].items.length;
						totalItemsInDatabase = Math.max(totalItemsInDatabase, draft.pages[index].totalItems);
					}
				});

				const pagesLeftInAllItems = Math.ceil(allItems.length / perPage);
				if (allItems.length > 0 && totalItemsWeHave === totalItemsInDatabase) {
					// add pages only if we have all items in the database
					data = produce(data, (draft) => {
						for (let index = 0; index < pagesLeftInAllItems; index++) {
							draft.pages.push(
								new ListResult(
									draft.pages[draft.pages.length - 1].page + 1,
									perPage,
									draft.pages[draft.pages.length - 1].totalItems,
									draft.pages[draft.pages.length - 1].totalPages,
									allItems.splice(0, perPage)
								) as Draft<ListResult<T>>
							);
							draft.pageParams.push(draft.pages[draft.pages.length - 1].page + 1);
						}
					});
				}

				if (
					totalItemsWeHave === totalItemsInDatabase &&
					data.pages.length > 1 &&
					data.pages[data.pages.length - 1].items.length === 0
				) {
					// delete empty pages only if we have all items in the database, and there is at least one page
					data = produce(data, (draft) => {
						draft.pages.pop();
						draft.pageParams.pop();
					});
				}

				queryClient.setQueryData<InfiniteData<ListResult<T>>>(queryKey, () => data);

				if (deleteIndex !== -1 && totalItemsWeHave !== totalItemsInDatabase) {
					// something cache was aware of was deleted and we don't have all items in the database, so invalidate last page
					const pageNumToInvalidate = data.pages[data.pages.length - 1].page;
					queryClient.invalidateQueries<ListResult<T>>({
						queryKey,
						refetchPage: (lastPage, index, allPages) =>
							allPages[index].page === pageNumToInvalidate,
						exact: true
					});
				} else if (
					itemUnawareDelete &&
					totalItemsWeHave !== totalItemsInDatabase &&
					(data.pages[0].page !== 1 ||
						data.pages[data.pages.length - 1].page !== data.pages[data.pages.length - 1].totalPages)
				) {
					// an item we were unaware of but affects this query was deleted, we don't have all items in database, and we don't have the first page or last page, so invalidate all pages since item we were unaware of that was deleted could change what items are in our pages
					queryClient.invalidateQueries<ListResult<T>>({
						queryKey,
						exact: true
					});
				} else if (
					positionBeforeSort !== -1 &&
					positionAfterSort !== -1 &&
					totalItemsWeHave !== totalItemsInDatabase
				) {
					// something was updated/created and we don't have all items in the database
					if (
						positionAfterSort === allItems.length &&
						data.pages[data.pages.length - 1].page !== data.pages[data.pages.length - 1].totalPages
					) {
						// after sorting, item ended up as the last item and we don't have the last page, so invalidate all pages
						queryClient.invalidateQueries<ListResult<T>>({
							queryKey,
							exact: true
						});
					} else if (positionAfterSort === 0 && data.pages[0].page !== 1) {
						// after sorting, item ended up as the first item and we don't have the first page, so invalidate all pages
						queryClient.invalidateQueries<ListResult<T>>({
							queryKey,
							exact: true
						});
					}
				}
			}
		}
	}
};

/**
 * Meant for SSR use, simply returns paginated records from a collection. See [TanStack's documentation](https://tanstack.com/query/v4/docs/svelte/ssr#using-initialdata) and this project's README.md for some examples.
 *
 * @param collection The collection from which to get paginated records.
 * @param [options.page] The page that will be passed on to `getList`. By default, `1`.
 * @param [options.perPage] The per page that will be passed on to `getList`. By default, `20`.
 * @param [options.queryParams] The query params that will be passed on to `getList`.
 * @returns The initial data required for a collection query, i.e. an array of Pocketbase records.
 */
export const infiniteCollectionQueryInitialData = async <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>
>(
	collection: ReturnType<Client['collection']>,
	{
		page = 1,
		perPage = 20,
		queryParams = undefined
	}: { page?: number; perPage?: number; queryParams?: RecordListQueryParams } = {}
): Promise<ListResult<T>> => ({ ...(await collection.getList<T>(page, perPage, queryParams)) });

/**
 * Meant for SSR use, allows for prefetching queries on the server so that data is already available in the cache, and no initial fetch occurs client-side. See [TanStack's documentation](https://tanstack.com/query/v4/docs/svelte/ssr#using-prefetchquery) and this project's README.md for some examples.
 *
 * @param collection The collection from which to get paginated records.
 * @param [options.page] The page that will be passed on to `getList`. By default, `1`.
 * @param [options.perPage] The per page that will be passed on to `getList`. By default, `20`.
 * @param [options.queryParams] The query params are simply passed on to `getList` for the initial data fetch, and `getOne` for realtime updates. If the `expand` key is provided, the record is expanded every time a realtime update is received.
 * @param [options.queryKey] Provides the query key option for TanStack Infinite Query. By default, uses the `collectionKeys` function from this package.
 * @param [options.staleTime] Provides the stale time option for TanStack Infinite Query. By default, `Infinity` since the query receives realtime updates. Note that the package will take care of automatically marking the query as stale when the last subscriber unsubscribes from this query.
 * @param [options] The rest of the options are passed to the `prefetchQuery` function from TanStack Infinite Query, this library has no defaults for them.
 * @returns The fully-configured options object that is ready to be passed on to the `prefetchQuery` function from TanStack Query.
 */

export const infiniteCollectionQueryPrefetch = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: ReturnType<Client['collection']>,
	{
		staleTime = Infinity,
		page = 1,
		perPage = 20,
		queryParams = undefined,
		queryKey = collectionKeys({
			collection,
			...(queryParams && queryParams),
			...(page && { page }),
			...(perPage && { perPage })
		}) as unknown as TQueryKey,
		...options
	}: InfiniteQueryPrefetchOptions<ListResult<T>, ClientResponseError, ListResult<T>, TQueryKey> = {}
): FetchQueryOptions<ListResult<T>, ClientResponseError, ListResult<T>, TQueryKey> => ({
	staleTime,
	queryKey,
	...options,
	queryFn: async () =>
		await infiniteCollectionQueryInitialData<T>(collection, { page, perPage, queryParams })
});

/**
 * Creates a TanStack Infinite Query that updates paginated Pocketbase records in realtime.
 *
 * Notes:
 * - When running server-side, the realtime subscription will not be created.
 * - When a realtime update is received, after the action is handled, the `filterFunction` runs first, then `sortFunction` runs, then the records are chunked into pages and the relevant pages are marked as stale, if needed.
 *
 * @param collection The collection from which to get paginated records.
 * @param [options.page] The page that will be passed on to `getList`. By default, `1`.
 * @param [options.perPage] The per page that will be passed on to `getList`. By default, `20`.
 * @param [options.queryParams] The query params are simply passed on to `getFullList` for the initial data fetch, and `getOne` for realtime updates. If the `expand` key is provided, the record is expanded every time a realtime update is received.
 * @param [options.keepCurrentPageOnly] Only keeps data from the current page of the infinite query, and discards the rest of the data when a page is changed.
 * @param [options.sortFunction] `compareFn` from `Array.prototype.sort` that runs when an action is received via the realtime subscription. This is used since Pocketbase realtime subscriptions does not support `sort` in `queryParams`.
 * @param [options.filterFunction] `predicate` from `Array.prototype.filter` that runs when an action is received via the realtime subscription. This is used since Pocketbase realtime subscriptions does not support `filter` in `queryParams`.
 * @param [options.filterFunctionThisArg] `thisArg` from `Array.prototype.filter` that runs when an action is received via the realtime subscription. This is used since Pocketbase realtime subscriptions does not support `filter` in `queryParams`.
 * @param [options.disableRealtime] Provides an option to disable realtime updates to the array of Pocketbase records. By default, `false` since we want the array of Pocketbase records to be updated in realtime. If set to `true`, a realtime subscription to the Pocketbase server is never sent. Don't forget to set `options.staleTime` to a more appropriate value than `Infinity` you disable realtime updates.
 * @param [options.invalidateQueryOnRealtimeError] Provides an option to invalidate the query if a realtime error occurs. By default, `true` since if a realtime error occurs, the query's data would be stale.
 * @param [options.onRealtimeUpdate] This function is called with the realtime action every time an realtime action is received.
 * @param [options.queryKey] Provides the query key option for TanStack Infinite Query. By default, uses the `collectionKeys` function from this package.
 * @param [options.staleTime] Provides the stale time option for TanStack Infinite Query. By default, `Infinity` since the query receives realtime updates. Note that the package will take care of automatically marking the query as stale when the last subscriber unsubscribes from this query.
 * @param [options.refetchOnReconnect] Provides the refetch on reconnection option for TanStack Infinite Query. By default, `'always'` since the query we wouldn't be receiving realtime updates if connection was lost.
 * @param [options.enable] Provides the enabled option for TanStack Infinite Query. By default, `true` since we want the query to be enabled. If set to `false`, this also disables realtime updates to the Pocketbase record.
 * @param [options] The rest of the options are passed to the `createQuery` function from TanStack Infinite Query, this library has no defaults for them.
 * @returns The same object as TanStack Query's `createInfiniteQuery`, with paginated Pocketbase records that update in realtime.
 */

export const createInfiniteCollectionQuery = <
	T extends Pick<Record, 'id' | 'updated'> = Pick<Record, 'id' | 'updated'>,
	TQueryKey extends QueryKey = QueryKey
>(
	collection: ReturnType<Client['collection']>,
	{
		staleTime = Infinity,
		refetchOnReconnect = 'always',
		page = 1,
		perPage = 20,
		queryParams = undefined,
		queryKey = collectionKeys({
			collection,
			...(queryParams && queryParams),
			...(page && { page }),
			...(perPage && { perPage })
		}) as unknown as TQueryKey,
		enabled = true,
		disableRealtime = false,
		invalidateQueryOnRealtimeError = true,
		keepCurrentPageOnly = false,
		debug = false,
		...options
	}: InfiniteCollectionStoreOptions<
		ListResult<T>,
		ClientResponseError,
		ListResult<T>,
		TQueryKey,
		T,
		RecordSubscription<T>
	> = {}
): CreateInfiniteQueryResult<ListResult<T>, ClientResponseError> => {
	const queryClient = useQueryClient();
	let latestTotalItems = 0;
	let latestTotalPages = 0;

	const store = createInfiniteQuery<ListResult<T>, ClientResponseError, ListResult<T>, TQueryKey>({
		staleTime,
		refetchOnReconnect,
		queryKey,
		enabled,
		...options,
		queryFn: async ({ pageParam = page }) => {
			const data = await infiniteCollectionQueryInitialData<T>(collection, {
				page: pageParam,
				perPage,
				queryParams
			});
			if (keepCurrentPageOnly) {
				queryClient.setQueryData<InfiniteData<ListResult<T>>>(queryKey, (old) => {
					if (old) {
						return produce(old, (draft) => {
							draft.pages = [];
							draft.pageParams = [];
						});
					}
					return old;
				});
			} else {
				latestTotalItems = data.totalItems;
				latestTotalPages = data.totalPages;
				queryClient.setQueryData<InfiniteData<ListResult<T>>>(queryKey, (old) => {
					if (old) {
						return produce(old, (draft) => {
							for (let index = 0; index < draft.pages.length; index++) {
								draft.pages[index].totalItems = latestTotalItems;
								draft.pages[index].totalPages = latestTotalPages;
							}
						});
					}
					return old;
				});
			}
			return data;
		},
		getNextPageParam: (lastPage, allPages) =>
			lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
		getPreviousPageParam: (lastPage, allPages) =>
			lastPage.page > 1 ? lastPage.page - 1 : undefined
	});

	const unsubscribePromise =
		disableRealtime || !enabled || import.meta.env.SSR
			? async () => {}
			: collection
					.subscribe<T>('*', (data) => {
						infiniteCollectionStoreCallback(
							queryClient,
							queryKey,
							data,
							collection,
							perPage,
							queryParams,
							options.sortFunction,
							options.filterFunction,
							options.filterFunctionThisArg
						)
							.then(() => {
								debug &&
									console.log(
										`(IC) ${JSON.stringify(queryKey)}: updating with realtime action:`,
										data.action,
										data.record.id
									);
							})
							.catch((e) => {
								debug &&
									console.log(
										`(IC) ${JSON.stringify(queryKey)}: invalidating query due to callback error:`,
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
								`(IC) [${JSON.stringify(
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
			debug && console.log(`(IC) ${JSON.stringify(queryKey)}: subscribing to changes...`);
			let unsubscriber = store.subscribe(...args);
			return () => {
				debug && console.log(`(IC) ${JSON.stringify(queryKey)}: unsubscribing from store.`);
				(async () => {
					await (
						await unsubscribePromise
					)();
					debug && console.log(`(IC) ${JSON.stringify(queryKey)}: marking query as stale.`);
					queryClient.invalidateQueries({ queryKey, exact: true });
				})();
				return unsubscriber();
			};
		}
	};
};
