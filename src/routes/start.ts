import type { RequestHandler } from '@sveltejs/kit';
import type { Got } from 'got';

enum SeatTemperature {
	High = 8,
	Medium = 7,
	Low = 6
}

interface StartConfig {
	airTemp: number;
	defrost: boolean;
	seatHeater: boolean;
}

const WINTER_CONFIG: StartConfig = {
	airTemp: 78,
	defrost: true,
	seatHeater: true
};

const SUMMER_CONFIG: StartConfig = {
	airTemp: 62,
	defrost: false,
	seatHeater: false
};

export const post: RequestHandler = async ({ locals, request: { headers } }) => {
	// @ts-ignore
	const request: Got = locals.vehicle._request.bind(locals.vehicle);

	// @ts-ignore
	const getDefaultHeaders: () => Record<string, string> = locals.vehicle.getDefaultHeaders.bind(
		locals.vehicle
	);

	const currentTemperature = parseFloat(headers.get('current-temperature')!);

	if (!currentTemperature) {
		return { status: 400, body: 'Invalid or missing temperature' };
	}

	const startConfig = currentTemperature > 64 ? SUMMER_CONFIG : WINTER_CONFIG;

	const requestConfig = {
		airTemp: {
			unit: 1,
			value: String(startConfig.airTemp)
		},
		defrost: startConfig.defrost,
		heating1: +startConfig.defrost,
		seatHeaterVentInfo: startConfig.seatHeater
			? {
					drvSeatHeatState: SeatTemperature.High,
					astSeatHeatState: SeatTemperature.High
			  }
			: null
	};

	if (headers.get('debug')) {
		return { status: 200, body: requestConfig };
	}

	const res = await request('/ac/v2/rcs/rsc/start', {
		method: 'POST',
		headers: {
			...getDefaultHeaders(),
			offset: '-4',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			Ims: 0,
			airCtrl: 1,
			username: locals.vehicle.userConfig.username,
			vin: locals.vehicle.vehicleConfig.vin,
			igniOnDuration: 10,
			...requestConfig
		})
	});

	return { status: res.statusCode, body: res.statusMessage };
};
