import type { RequestEvent } from '@sveltejs/kit';

export const GET = async ({ locals }: RequestEvent) => {
	throw new Error("@migration task: Migrate this return statement (https://github.com/sveltejs/kit/discussions/5774#discussioncomment-3292701)");
	// Suggestion (check for correctness before using):
	// return new Response(await locals.vehicle.status({ parsed: false, refresh: false }));
	return {
		body: await locals.vehicle.status({ parsed: false, refresh: false })
	};
};
