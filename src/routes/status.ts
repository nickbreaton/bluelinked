import type { RequestHandler } from '@sveltejs/kit';

export const get: RequestHandler = async ({ locals }) => {
	return {
		body: await locals.vehicle.status({ parsed: false, refresh: false })
	};
};
