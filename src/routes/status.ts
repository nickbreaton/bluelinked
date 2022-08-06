import type { RequestEvent } from '@sveltejs/kit';

export const GET = async ({ locals }: RequestEvent) => {
	return {
		body: await locals.vehicle.status({ parsed: false, refresh: false })
	};
};
