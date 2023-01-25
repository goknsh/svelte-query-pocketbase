<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { createCollectionQuery, createRecordQuery } from '$lib';
	import { createInfiniteCollectionQuery } from '$lib/queries/infinite-collection';
	import { onMount } from 'svelte';

	const pocketbase = new Pocketbase('https://voel.local');

	const query = createInfiniteCollectionQuery(pocketbase.collection('test'), { page: 2 });

	// onMount(() => {
	// 	setTimeout(() => {
	// 		for (let index = 0; index < 20; index++) {
	// 			pocketbase.collection('test').create({ name: `Record ${index}` }, { $autoCancel: false });
	// 		}
	// 	}, 3000);
	// });
</script>

<a href="/find">Find</a>

{#if $query.isLoading}
	Loading...
{/if}
{#if $query.error}
	<span>Error: {$query.error.message}</span>
{/if}
{#if $query.isSuccess}
	<div>
		<pre>
			{JSON.stringify($query, null, 2)}
		</pre>
	</div>
	<div>
		<button
			on:click={() => $query.fetchPreviousPage()}
			disabled={!$query.hasPreviousPage || $query.isFetchingPreviousPage}
		>
			{#if $query.isFetching}
				Loading more...
			{:else if $query.hasPreviousPage}
				Load Previous
			{:else}Nothing more to load{/if}
		</button>
		<button
			on:click={() => $query.fetchNextPage()}
			disabled={!$query.hasNextPage || $query.isFetchingNextPage}
		>
			{#if $query.isFetching}
				Loading more...
			{:else if $query.hasNextPage}
				Load More
			{:else}Nothing more to load{/if}
		</button>
	</div>
{/if}
