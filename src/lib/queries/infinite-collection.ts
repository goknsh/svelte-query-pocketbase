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
	type CreateInfiniteQueryResult
} from '@tanstack/svelte-query';

import { chunk, uniqBy } from 'lodash';

import { realtimeStoreExpand } from '../internal';
import { collectionKeys } from '../query-key-factory';
import type { InfiniteCollectionStoreOptions, InfiniteQueryPrefetchOptions } from '../types';

const infiniteCollectionStoreCallback = async <T extends Pick<Record, 'id'>>(
	data: InfiniteData<ListResult<T>>,
	subscription: RecordSubscription<T>,
	collection: ReturnType<Client['collection']>,
	perPage: number,
	queryParams: RecordListQueryParams | undefined = undefined,
	sortFunction?: (a: T, b: T) => number,
	filterFunction?: (value: T, index: number, array: T[]) => boolean,
	filterFunctionThisArg?: any,
	ignoreUnknownRecords = true
): Promise<{ data: InfiniteData<ListResult<T>>; invalidatePages: Set<number> }> => {
	let allPages = uniqBy(
		data.pages.flatMap((page) => page.items),
		'id'
	);

	const lastDataPage = data.pages.slice(-1).at(0);

	let totalItems = lastDataPage?.totalItems ?? 0;

	switch (subscription.action) {
		case 'update':
			let updateIndex = allPages.findIndex((item) => item.id === subscription.record.id);
			subscription.record =
				updateIndex === -1 && !ignoreUnknownRecords
					? await realtimeStoreExpand(collection, subscription.record, queryParams?.expand)
					: subscription.record;
			if (updateIndex === -1 && !ignoreUnknownRecords) {
				allPages.push(subscription.record);
			} else {
				allPages[updateIndex] = subscription.record;
			}
			break;
		case 'create':
			let createIndex = allPages.findIndex((item) => item.id === subscription.record.id);
			subscription.record =
				createIndex === -1 && !ignoreUnknownRecords
					? await realtimeStoreExpand(collection, subscription.record, queryParams?.expand)
					: subscription.record;
			if (createIndex === -1 && !ignoreUnknownRecords) {
				allPages.push(subscription.record);
				totalItems += 1;
			} else {
				allPages[createIndex] = subscription.record;
			}
			break;
		case 'delete':
			allPages = allPages.filter((item) => item.id !== subscription.record.id);
			totalItems -= 1;
			break;
	}

	allPages = allPages.sort(sortFunction);
	if (filterFunction) {
		let allPagesCountBeforeFilter = allPages.length;
		allPages = allPages.filter(filterFunction, filterFunctionThisArg);
		let allPagesCountAfterFilter = allPages.length;
		if (allPagesCountAfterFilter < allPagesCountBeforeFilter) {
			totalItems -= 1;
		}
	}

	const chunks = chunk(allPages, perPage);
	let totalPages = Math.ceil(totalItems / perPage);

	let invalidatePages = new Set<number>();
	let lastDataPageNum = lastDataPage?.page ?? 0;
	while (chunks.length > data.pages.length) {
		lastDataPageNum++;
		data.pages.push(new ListResult(lastDataPageNum, perPage, totalItems, totalPages, []));
		data.pageParams.push(lastDataPageNum);
	}

	let dataPageIndex = 0;
	for (const chunk of chunks) {
		data.pages[dataPageIndex].totalItems = totalItems;
		data.pages[dataPageIndex].totalPages = totalPages;
		data.pages[dataPageIndex].items = chunk;
		if (chunk.length < perPage && totalItems > (dataPageIndex + 1) * perPage + chunk.length) {
			invalidatePages.add(data.pages[dataPageIndex].page);
		}
		dataPageIndex++;
	}

	for (let index = dataPageIndex; index < data.pages.length; index++) {
		if (totalItems > (dataPageIndex + 1) * perPage) {
			data.pages[dataPageIndex].totalItems = totalItems;
			data.pages[dataPageIndex].totalPages = totalPages;
			data.pages[dataPageIndex].items = [];
			invalidatePages.add(data.pages[dataPageIndex].page);
		} else {
			data.pages.length = dataPageIndex + 1;
			data.pageParams.length = dataPageIndex + 1;
			break;
		}
	}

	return { data, invalidatePages };
};

export const infiniteCollectionQueryInitialData = <
	T extends Pick<Record, 'id'> = Pick<Record, 'id'>
>(
	collection: ReturnType<Client['collection']>,
	{
		page = 1,
		perPage = 20,
		queryParams = undefined
	}: { page?: number; perPage?: number; queryParams?: RecordListQueryParams } = {}
): Promise<ListResult<T>> => collection.getList<T>(page, perPage, queryParams);

export const infiniteCollectionQueryPrefetch = <
	T extends Pick<Record, 'id'> = Pick<Record, 'id'>,
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

export const createInfiniteCollectionQuery = <
	T extends Pick<Record, 'id'> = Pick<Record, 'id'>,
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
		ignoreUnknownRecords = true,
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
						old.pages = [];
						old.pageParams = [];
					}
					return old;
				});
			} else {
				latestTotalItems = data.totalItems;
				latestTotalPages = data.totalPages;
				queryClient.setQueryData<InfiniteData<ListResult<T>>>(queryKey, (old) => {
					if (old) {
						old.pages = old.pages.map((page) => {
							page.totalItems = latestTotalItems;
							page.totalPages = latestTotalPages;
							return page;
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
							queryClient.getQueryData<InfiniteData<ListResult<T>>>(queryKey) ?? {
								pages: [],
								pageParams: []
							},
							data,
							collection,
							perPage,
							queryParams,
							options.sortFunction,
							options.filterFunction,
							options.filterFunctionThisArg,
							ignoreUnknownRecords
						)
							.then((r) => {
								console.log(
									`(IC) ${JSON.stringify(queryKey)}: updating with realtime action:`,
									data.action,
									data.record.id
								);
								queryClient.setQueryData<InfiniteData<ListResult<T>>>(queryKey, () => r.data);
								queryClient.invalidateQueries<ListResult<T>>({
									queryKey,
									refetchPage: (lastPage, index, allPages) =>
										r.invalidatePages.has(allPages[index].page),
									exact: true
								});
							})
							.catch((e) => {
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
			console.log(`(IC) ${JSON.stringify(queryKey)}: subscribing to changes...`);
			let unsubscriber = store.subscribe(...args);
			return () => {
				console.log(`(IC) ${JSON.stringify(queryKey)}: unsubscribing from store.`);
				(async () => {
					await (
						await unsubscribePromise
					)();
					console.log(`(IC) ${JSON.stringify(queryKey)}: marking query as stale.`);
					queryClient.invalidateQueries({ queryKey, exact: true });
				})();
				return unsubscriber();
			};
		}
	};
};
