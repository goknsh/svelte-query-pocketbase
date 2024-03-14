> [!WARNING]
> The repository is no longer being worked on, and the npm package has been deprecated. Feel free to fork and continue development.

# svelte-query-pocketbase

TanStack Query wrappers around Pocketbase Realtime for Svelte.

## Installation

```
npm i -D svelte-query-pocketbase
```

## Record Query

Creates a TanStack Query that updates a Pocketbase record in realtime. View the JSDoc for the relevant functions for more documentation on their available options.

### Simple Example

<details>
	<summary>View Code</summary>

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createRecordQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	const someRecord = createRecordQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection),
		'some_id'
	);
</script>

{#if $someRecord.data}
	<p>Fetched record:</p>
	<pre>{JSON.stringify($someRecord.data, null, 2)}</pre>
{:else if $someRecord.error}
	{#if $someRecord.error.status === 404}
		<p>The record couldn't be found in the database.</p>
	{:else}
		<p>Something went wrong.</p>
		<button on:click={() => $someRecord.refetch()}>Try again</button>
	{/if}
{:else}
	<p>Loading...</p>
{/if}
```

</details>

### With Query Params

<details>
	<summary>View Code</summary>

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createRecordQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	const someRecord = createRecordQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection),
		'some_id',
		{
			queryParams: {
				expand: 'some_field',
				fields: 'some_field' // the library will internally add id and updated to this
			}
		}
	);
</script>

{#if $someRecord.data}
	<p>Fetched record, with some_field expanded:</p>
	<pre>{JSON.stringify($someRecord.data, null, 2)}</pre>
{:else if $someRecord.error}
	{#if $someRecord.error.status === 404}
		<p>The record couldn't be found in the database.</p>
	{:else}
		<p>Something went wrong.</p>
		<button on:click={() => $someRecord.refetch()}>Try again</button>
	{/if}
{:else}
	<p>Loading...</p>
{/if}
```

</details>

### Using SSR

Read [TanStack Query's docs on this](https://tanstack.com/query/v4/docs/svelte/ssr) first. The examples below are modified versions of the examples on that page.

#### Using `initialData`

<details>
	<summary>View Code</summary>

**src/routes/+page.ts**

```ts
import type { PageLoad } from './$types';

import Pocketbase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

// Types generated from https://github.com/patmood/pocketbase-typegen
import { Collections, type SomeCollectionResponse } from '$lib/collections';

import { createRecordQueryInitialData } from 'svelte-query-pocketbase';

export const load: PageLoad = async () => {
	const someIdInitialData = await createRecordQueryInitialData<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection),
		'some_id'
	);
	return { someIdInitialData };
};
```

**src/routes/+page.svelte**

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	import type { PageData } from './$types';
	export let data: PageData;

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createRecordQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	const someRecord = createRecordQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection),
		'some_id',
		{
			initialData: data.someIdInitialData
		}
	);
</script>
```

</details>

#### Using `prefetchQuery`

<details>
	<summary>View Code</summary>

**src/routes/+layout.ts**

_Same as TanStack Query's docs_

**src/routes/+layout.svelte**

_Same as TanStack Query's docs_

**src/routes/+page.ts**

```ts
import type { PageLoad } from './$types';

import Pocketbase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

// Types generated from https://github.com/patmood/pocketbase-typegen
import { Collections, type SomeCollectionResponse } from '$lib/collections';

import { createRecordQueryPrefetch } from 'svelte-query-pocketbase';

export const load: PageLoad = async ({ parent }) => {
	const { queryClient } = await parent();

	// As long as the same collection, id, and queryParams are supplied to
	// `createRecordQueryPrefetch` and `createRecordQuery`, the library will
	// generate the same `queryKey`s for both functions, and you need not specify one
	await queryClient.prefetchQuery(
		createRecordQueryPrefetch<SomeCollectionResponse>(
			pocketbase.collection(Collections.SomeCollection),
			'some_id'
		)
	);
};
```

**src/routes/+page.svelte**

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	import type { PageData } from './$types';
	export let data: PageData;

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createRecordQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	// This data is cached by prefetchQuery in +page.ts so no fetch actually happens here
	const someRecord = createRecordQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection),
		'some_id'
	);
</script>
```

</details>

## Collection Query

Creates a TanStack Query that updates an array of Pocketbase records in realtime. View the JSDoc for the relevant functions for more documentation on their available options.

### Simple Example

<details>
	<summary>View Code</summary>

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createCollectionQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	const someCollection = createCollectionQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection)
	);
</script>

{#if $someCollection.data}
	<p>Fetched collection:</p>
	<pre>{JSON.stringify($someCollection.data, null, 2)}</pre>
{:else if $someCollection.error}
	{#if $someCollection.error.status === 404}
		<p>The collection couldn't be found in the database.</p>
	{:else}
		<p>Something went wrong.</p>
		<button on:click={() => $someCollection.refetch()}>Try again</button>
	{/if}
{:else}
	<p>Loading...</p>
{/if}
```

</details>

### With Query Params

<details>
	<summary>View Code</summary>

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createCollectionQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	const someCollection = createCollectionQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection),
		{
			queryParams: {
				expand: 'some_field',
				sort: '-created', // sort by date created, descending
				filter: 'created >= "2022-01-01 00:00:00"',
				fields: 'some_field' // the library will internally add id and updated to this
			},
			// sortFunction and filterFunction are applied after a realtime update is applied
			sortFunction: (a, b) => new Date(a.created) - new Date(b.created) // sort by date created, descending
			filterFunction: (record) => new Date(record.created) >= new Date("2022-01-01 00:00:00")
		}
	);
</script>

{#if $someCollection.data}
	<p>
		Fetched collection, with some_field expanded, sorted by date created (descending), and filtered
		by date created after 2022-01-01 00:00:00:
	</p>
	<pre>{JSON.stringify($someCollection.data, null, 2)}</pre>
{:else if $someCollection.error}
	{#if $someCollection.error.status === 404}
		<p>The collection couldn't be found in the database.</p>
	{:else}
		<p>Something went wrong.</p>
		<button on:click={() => $someCollection.refetch()}>Try again</button>
	{/if}
{:else}
	<p>Loading...</p>
{/if}
```

</details>

### Using SSR

Read [TanStack Query's docs on this](https://tanstack.com/query/v4/docs/svelte/ssr) first. The examples below are modified versions of the examples on that page.

#### Using `initialData`

<details>
	<summary>View Code</summary>

**src/routes/+page.ts**

```ts
import type { PageLoad } from './$types';

import Pocketbase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

// Types generated from https://github.com/patmood/pocketbase-typegen
import { Collections, type SomeCollectionResponse } from '$lib/collections';

import { createCollectionQueryInitialData } from 'svelte-query-pocketbase';

export const load: PageLoad = async () => {
	const someCollectionInitialData = await createCollectionQueryInitialData<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection)
	);
	return { someCollectionInitialData };
};
```

**src/routes/+page.svelte**

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	import type { PageData } from './$types';
	export let data: PageData;

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createCollectionQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	const someCollection = createCollectionQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection),
		{
			initialData: data.someCollectionInitialData
		}
	);
</script>
```

</details>

#### Using `prefetchQuery`

<details>
	<summary>View Code</summary>

**src/routes/+layout.ts**

_Same as TanStack Query's docs_

**src/routes/+layout.svelte**

_Same as TanStack Query's docs_

**src/routes/+page.ts**

```ts
import type { PageLoad } from './$types';

import Pocketbase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

// Types generated from https://github.com/patmood/pocketbase-typegen
import { Collections, type SomeCollectionResponse } from '$lib/collections';

import { createCollectionQueryPrefetch } from 'svelte-query-pocketbase';

export const load: PageLoad = async ({ parent }) => {
	const { queryClient } = await parent();

	// As long as the same collection, id, and queryParams are supplied to
	// `createCollectionQueryPrefetch` and `createCollectionQuery`, the library will
	// generate the same `queryKey`s for both functions, and you need not specify one
	await queryClient.prefetchQuery(
		createCollectionQueryPrefetch<SomeCollectionResponse>(
			pocketbase.collection(Collections.SomeCollection)
		)
	);
};
```

**src/routes/+page.svelte**

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	import type { PageData } from './$types';
	export let data: PageData;

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createCollectionQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	// This data is cached by prefetchQuery in +page.ts so no fetch actually happens here
	const someCollection = createCollectionQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection)
	);
</script>
```

</details>

## Infinite Collection Query

Creates a TanStack Infinite Query that updates paginated Pocketbase records in realtime. View the JSDoc for the relevant functions for more documentation on their available options.

### Simple Example

<details>
	<summary>View Code</summary>

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createInfiniteCollectionQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	const someInfiniteCollection = createInfiniteCollectionQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection)
	);
</script>

{#if $someInfiniteCollection.data}
	<p>Fetched infinite collection:</p>
	<pre>{JSON.stringify($someInfiniteCollection.data, null, 2)}</pre>
	{#if $someInfiniteCollection.hasNextPage}
		<button
			on:click={() => $someInfiniteCollection.fetchNextPage()}
			disabled={$someInfiniteCollection.isFetchingNextPage}
			>{$someInfiniteCollection.isFetchingNextPage
				? 'Fetching next page...'
				: 'Fetch next page'}</button
		>
	{/if}
{:else if $someInfiniteCollection.error}
	{#if $someInfiniteCollection.error.status === 404}
		<p>The collection couldn't be found in the database.</p>
	{:else}
		<p>Something went wrong.</p>
		<button on:click={() => $someInfiniteCollection.refetch()}>Try again</button>
	{/if}
{:else}
	<p>Loading...</p>
{/if}
```

</details>

### With Query Params

<details>
	<summary>View Code</summary>

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createInfiniteCollectionQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	const someInfiniteCollection = createInfiniteCollectionQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection),
		{
			queryParams: {
				expand: 'some_field',
				sort: '-created', // sort by date created, descending
				filter: 'created >= "2022-01-01 00:00:00"',
				fields: 'some_field' // the library will internally add id and updated to this
			},
			// sortFunction and filterFunction are applied after a realtime update is applied
			sortFunction: (a, b) => new Date(a.created) - new Date(b.created) // sort by date created, descending
			filterFunction: (record) => new Date(record.created) >= new Date("2022-01-01 00:00:00")
		}
	);
</script>

{#if $someInfiniteCollection.data}
	<p>
		Fetched infinite collection, with some_field expanded, sorted by date created (descending), and
		filtered by date created after 2022-01-01 00:00:00:
	</p>
	<pre>{JSON.stringify($someInfiniteCollection.data, null, 2)}</pre>
	{#if $someInfiniteCollection.hasNextPage}
		<button
			on:click={() => $someInfiniteCollection.fetchNextPage()}
			disabled={$someInfiniteCollection.isFetchingNextPage}
			>{$someInfiniteCollection.isFetchingNextPage
				? 'Fetching next page...'
				: 'Fetch next page'}</button
		>
	{/if}
{:else if $someInfiniteCollection.error}
	{#if $someInfiniteCollection.error.status === 404}
		<p>The collection couldn't be found in the database.</p>
	{:else}
		<p>Something went wrong.</p>
		<button on:click={() => $someInfiniteCollection.refetch()}>Try again</button>
	{/if}
{:else}
	<p>Loading...</p>
{/if}
```

</details>

### Using SSR

Read [TanStack Query's docs on this](https://tanstack.com/query/v4/docs/svelte/ssr) first. The examples below are modified versions of the examples on that page.

#### Using `initialData`

<details>
	<summary>View Code</summary>

**src/routes/+page.ts**

```ts
import type { PageLoad } from './$types';

import Pocketbase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

// Types generated from https://github.com/patmood/pocketbase-typegen
import { Collections, type SomeCollectionResponse } from '$lib/collections';

import { infiniteCollectionQueryInitialData } from 'svelte-query-pocketbase';

export const load: PageLoad = async () => {
	const someInfiniteCollectionInitialData =
		await infiniteCollectionQueryInitialData<SomeCollectionResponse>(
			pocketbase.collection(Collections.SomeCollection)
		);
	return { someInfiniteCollectionInitialData };
};
```

**src/routes/+page.svelte**

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	import type { PageData } from './$types';
	export let data: PageData;

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createInfiniteCollectionQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	const someInfiniteCollection = createInfiniteCollectionQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection),
		{
			initialData: data.someInfiniteCollectionInitialData
		}
	);
</script>
```

</details>

#### Using `prefetchQuery`

<details>
	<summary>View Code</summary>

**src/routes/+layout.ts**

_Same as TanStack Query's docs_

**src/routes/+layout.svelte**

_Same as TanStack Query's docs_

**src/routes/+page.ts**

```ts
import type { PageLoad } from './$types';

import Pocketbase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

// Types generated from https://github.com/patmood/pocketbase-typegen
import { Collections, type SomeCollectionResponse } from '$lib/collections';

import { infiniteCollectionQueryPrefetch } from 'svelte-query-pocketbase';

export const load: PageLoad = async ({ parent }) => {
	const { queryClient } = await parent();

	// As long as the same collection, id, and queryParams are supplied to
	// `infiniteCollectionQueryPrefetch` and `createCollectionQuery`, the library will
	// generate the same `queryKey`s for both functions, and you need not specify one
	await queryClient.prefetchQuery(
		infiniteCollectionQueryPrefetch<SomeCollectionResponse>(
			pocketbase.collection(Collections.SomeCollection)
		)
	);
};
```

**src/routes/+page.svelte**

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	import type { PageData } from './$types';
	export let data: PageData;

	// Types generated from https://github.com/patmood/pocketbase-typegen
	import { Collections, type SomeCollectionResponse } from '$lib/collections';

	import { createInfiniteCollectionQuery } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	// This data is cached by prefetchQuery in +page.ts so no fetch actually happens here
	const someInfiniteCollection = createInfiniteCollectionQuery<SomeCollectionResponse>(
		pocketbase.collection(Collections.SomeCollection)
	);
</script>
```

</details>

## User Store

Svelte store wrapper around the authenticated Pocketbase user that updates in realtime.

### Using Default Auth Store

<details>
	<summary>View Code</summary>

```svelte
<script lang="ts">
	import Pocketbase from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	import { userStore, type KnownUser } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL);

	interface CustomKnownUser extends KnownUser {
		id: string;
		name: string;
		username: string;
		avatar?: string;
	}

	const user = userStore<CustomKnownUser>(pocketbase, (authStore) => ({
		isLoggedIn: true,
		id: authStore.model?.id ?? '',
		avatar: authStore.model?.avatar,
		username: authStore.model?.username ?? ''
		name: authStore.model?.name ?? '',
	}));
</script>

{#if $user.isLoggedIn}
	<p>Welcome, {$user.name}:</p>
	<pre>{JSON.stringify($user, null, 2)}</pre>
{:else}
	<p>You are not logged in.</p>
{/if}
```

</details>

### Using Local Auth Store

<details>
	<summary>View Code</summary>

```svelte
<script lang="ts">
	import Pocketbase, { LocalAuthStore } from 'pocketbase';
	import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

	import { userStore, type KnownUser } from 'svelte-query-pocketbase';

	const pocketbase = new Pocketbase(PUBLIC_POCKETBASE_URL, new LocalAuthStore("authInfo"));

	interface CustomKnownUser extends KnownUser {
		id: string;
		name: string;
		username: string;
		avatar?: string;
	}

	const user = userStore<CustomKnownUser, LocalAuthStore>(pocketbase, (authStore) => ({
		isLoggedIn: true,
		id: authStore.model?.id ?? '',
		avatar: authStore.model?.avatar,
		username: authStore.model?.username ?? ''
		name: authStore.model?.name ?? '',
	}));
</script>

{#if $user.isLoggedIn}
	<p>Welcome, {$user.name}:</p>
	<pre>{JSON.stringify($user, null, 2)}</pre>
{:else}
	<p>You are not logged in.</p>
{/if}
```

</details>
