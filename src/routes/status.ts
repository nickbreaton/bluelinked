import type { RequestHandler } from '@sveltejs/kit';

export const get: RequestHandler = async ({ locals }) => {
	return {
		body: JSON.stringify(await locals.vehicle.status({ parsed: false, refresh: false }), null, 2)
	};
};
