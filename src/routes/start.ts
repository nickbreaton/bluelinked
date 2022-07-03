import type { RequestHandler } from '@sveltejs/kit';
import type { Got } from 'got';

enum SeatTemperature {
	High = 8,
	Medium = 7,
	Low = 6
}

export const post: RequestHandler = async ({ locals }) => {
	// @ts-ignore
	const request: Got = locals.vehicle._request.bind(locals.vehicle);

	// @ts-ignore
	const getDefaultHeaders: () => Record<string, string> = locals.vehicle.getDefaultHeaders.bind(
		locals.vehicle
	);

	const res = await request('/ac/v2/rcs/rsc/start', {
		method: 'POST',
		headers: {
			...getDefaultHeaders(),
			offset: '-4',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			Ims: 0,
			airCtrl: 1, // 0 or 1
			airTemp: {
				unit: 1,
				value: '65'
			},
			defrost: false,
			heating1: 1, // 0 or 1
			igniOnDuration: 10,
			username: locals.vehicle.userConfig.username,
			vin: locals.vehicle.vehicleConfig.vin,
			seatHeaterVentInfo: {
				drvSeatHeatState: SeatTemperature.High,
				astSeatHeatState: SeatTemperature.High
			}
		})
	});

	return { status: res.statusCode, body: res.statusMessage };
};
