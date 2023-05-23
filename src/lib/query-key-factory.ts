import type { RecordListQueryParams, RecordService } from 'pocketbase';
import { reconcileOptionalFields } from './internal';

/**
 * A collection key factory to generate query keys for TanStack Query based on the parameters given to a Pocketbase `get[...]` function.
 *
 * @param [options.collection] The Pocketbase collection.
 * @param [options.id] The Pocketbase record id. By default, `'*'` to indicate all records in a collection.
 * @param [options] The rest of the options are everything that can be passed to `queryParams` parameter in Pocketbase `get[...]` functions. If you use `fields` to specify optional fields, note that `id` and `updated` will be added to the collection key since the library uses them internally.
 * @returns A query key, suitable for TanStack Query's `queryKey` option.
 */
export const collectionKeys = ({
	collection,
	id = '*',
	...queryParams
}: {
	collection: RecordService;
	id?: string;
} & RecordListQueryParams) => {
	return [
		{
			collection: collection.collectionIdOrName,
			id,
			...(queryParams && reconcileOptionalFields(queryParams))
		}
	] as const;
};
