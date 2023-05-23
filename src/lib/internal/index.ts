import type { BaseQueryParams, Record, RecordService } from 'pocketbase';

/**
 * Meant for internal use, simply returns the expanded record if there is an expand query param.
 *
 * @param collection Collection to call `getOne` on.
 * @param record The record to be expanded.
 * @param [expand] The expand query param.
 * @returns The expanded record.
 */
export const realtimeStoreExpand = async <T extends Pick<Record, 'id'>>(
	collection: RecordService,
	record: T,
	expand: string | undefined = undefined
): Promise<T> =>
	expand
		? await collection.getOne<T>(record.id, typeof expand === 'string' ? { expand } : undefined)
		: record;

export const reconcileOptionalFields = (queryParams: BaseQueryParams | undefined) => {
	if (
		queryParams &&
		'fields' in queryParams &&
		typeof queryParams.fields === 'string' &&
		queryParams.fields.length > 0
	) {
		// it is ok to split by comma since pocketbase doesn't allow collection fields to contain commas
		const fields = queryParams.fields.split(',');
		let shouldJoin = false;
		if (fields.findIndex((field) => field === 'id') === -1) {
			fields.push('id');
			shouldJoin = true;
		}
		if (fields.findIndex((field) => field === 'updated') === -1) {
			fields.push('updated');
			shouldJoin = true;
		}
		if (shouldJoin) {
			queryParams.fields = fields.join(',');
		}
	}
	return queryParams;
};
