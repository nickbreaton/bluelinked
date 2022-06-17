import type { Handle } from '@sveltejs/kit';

import Bluelinky from 'bluelinky';
import type { AmericanBlueLinkyConfig } from 'bluelinky/dist/controllers/american.controller';
import type AmericanVehicle from 'bluelinky/dist/vehicles/american.vehicle';

export const handle: Handle = async ({ event, resolve }) => {
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

	const [vehicle] = await client.getVehicles();
	event.locals.vehicle = vehicle;

	return await resolve(event);
};
