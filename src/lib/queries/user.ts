import type Client from 'pocketbase';
import type { BaseAuthStore, Record } from 'pocketbase';
import { readable, type Readable } from 'svelte/store';

import { isRecord, type KnownUser, type UnknownUser } from '../types';

/**
 * Svelte store wrapper around the authenticated Pocketbase user that updates in realtime.
 *
 * NOTE: This store returns an `UnknownUser` if the authenticated user is `Admin`.
 *
 * @param pocketbase Pocketbase instance's `authStore` which should be monitored for updates.
 * @param [extractKnownUser] Optional function to get only the properties you need from a logged in user.
 */
export const userStore = <
	CustomKnownUser extends KnownUser = Record & KnownUser,
	CustomAuthStore extends BaseAuthStore = BaseAuthStore
>(
	pocketbase: Client,
	extractKnownUser: (authStore: CustomAuthStore) => CustomKnownUser = (authStore) =>
		({ isLoggedIn: true, ...authStore.model } as CustomKnownUser)
): Readable<CustomKnownUser | UnknownUser> => {
	return readable<CustomKnownUser | UnknownUser>(
		pocketbase.authStore.model !== null &&
			pocketbase.authStore.isValid &&
			isRecord(pocketbase.authStore.model)
			? extractKnownUser(pocketbase.authStore as CustomAuthStore)
			: { isLoggedIn: false },
		(set) =>
			pocketbase.authStore.onChange(() =>
				set(extractKnownUser(pocketbase.authStore as CustomAuthStore))
			)
	);
};
