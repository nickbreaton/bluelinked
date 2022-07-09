import type { RequestEvent } from '@sveltejs/kit';
import { expect, test } from 'vitest';
import { get } from './status';

test('it responds with the current status', async () => {
	const status = { locked: true };
	const event: any = {
		locals: { vehicle: { status: () => status } }
	};
	const res = await get(event);
	expect(res).toEqual({ body: status });
});
