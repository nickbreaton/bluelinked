import { json, type RequestEvent } from '@sveltejs/kit';

export const GET = async ({ locals }: RequestEvent) => {
	return json(await locals.vehicle.status({ parsed: false, refresh: false }));
};
