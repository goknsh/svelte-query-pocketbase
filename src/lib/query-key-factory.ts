import type { RecordListQueryParams } from 'pocketbase';
import type Client from 'pocketbase';

export const collectionKeys = ({
	collection,
	id = '*',
	page,
	perPage,
	sort,
	filter,
	...queryParams
}: {
	collection: ReturnType<Client['collection']>;
	id?: string;
} & RecordListQueryParams) => {
	if (Object.keys(queryParams).length > 0) {
		return [
			{
				collection: collection.collectionIdOrName,
				id,
				...(page && { page }),
				...(perPage && { perPage }),
				...(sort && { sort }),
				...(filter && { filter })
			}
		] as const;
	} else {
		return [{ collection: collection.collectionIdOrName, id }] as const;
	}
};
