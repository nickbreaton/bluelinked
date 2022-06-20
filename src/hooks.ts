import type { Handle } from '@sveltejs/kit';

import Bluelinky from 'bluelinky';
import type { AmericanBlueLinkyConfig } from 'bluelinky/dist/controllers/american.controller';
import type AmericanVehicle from 'bluelinky/dist/vehicles/american.vehicle';

let client: Bluelinky<AmericanBlueLinkyConfig, 'US', AmericanVehicle>;

async function createBluelinkyClient() {
	console.log('Logging in...');

	const client = new Bluelinky<AmericanBlueLinkyConfig, 'US', AmericanVehicle>({
		brand: 'hyundai',
		region: 'US',
		username: process.env.BLUELINK_USERNAME,
		password: process.env.BLUELINK_PASSWORD,
		pin: process.env.BLUELINK_PIN
	});

	await new Promise<void>((resolve, reject) => {
		client.on('error', (error) => reject(error));
		client.on('ready', () => resolve());
	});

	return client;
}

export const handle: Handle = async ({ event, resolve }) => {
	if (process.env.SHARED_SECRET !== event.request.headers.get('Shared-Secret')) {
		return new Response(null, { status: 403 });
	}

	client ??= await createBluelinkyClient();
	const [vehicle] = await client.getVehicles();

	event.locals.client = client;
	event.locals.vehicle = vehicle;

	return await resolve(event);
};
