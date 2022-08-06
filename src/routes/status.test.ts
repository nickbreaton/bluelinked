import { expect, test } from 'vitest';
import { GET } from './status';

test('it responds with the current status', async () => {
	const status = { locked: true };
	const event: any = {
		locals: { vehicle: { status: () => status } }
	};
	const res = await GET(event);
	expect(res).toEqual({ body: status });
});
