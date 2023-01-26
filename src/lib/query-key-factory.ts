import type { RecordListQueryParams } from 'pocketbase';
import type Client from 'pocketbase';

export const collectionKeys = ({
	collection,
	id = '*',
	...queryParams
}: {
	collection: ReturnType<Client['collection']>;
	id?: string;
} & RecordListQueryParams) => {
	return [
		{
			collection: collection.collectionIdOrName,
			id,
			...(queryParams && queryParams)
		}
	] as const;
};
