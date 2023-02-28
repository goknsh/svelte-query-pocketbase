import type Client from 'pocketbase';
import type { Record } from 'pocketbase';

/**
 * Meant for internal use, simply returns the expanded record if there is an expand query param.
 *
 * @param collection Collection to call `getOne` on.
 * @param record The record to be expanded.
 * @param [expand] The expand query param.
 * @returns The expanded record.
 */
export const realtimeStoreExpand = async <T extends Pick<Record, 'id'>>(
	collection: ReturnType<Client['collection']>,
	record: T,
	expand: string | undefined = undefined
): Promise<T> =>
	expand
		? await collection.getOne<T>(record.id, typeof expand === 'string' ? { expand } : undefined)
		: record;
