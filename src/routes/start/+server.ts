import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
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
	airTemp: 74,
	defrost: true,
	seatHeater: true
};

const SUMMER_CONFIG: StartConfig = {
	airTemp: 68,
	defrost: false,
	seatHeater: false
};

export const POST = async ({ locals: { vehicle }, request: { headers } }: RequestEvent) => {
	// @ts-ignore
	const got: Got = vehicle._request.bind(vehicle);

	// @ts-ignore
	const defaultHeaders: Record<string, string> = vehicle.getDefaultHeaders();

	const currentTemperature = parseFloat(headers.get('current-temperature')!);

	if (!currentTemperature) {
		return new Response('Invalid or missing temperature', { status: 400 });
	}

	const startConfig = currentTemperature > 69 ? SUMMER_CONFIG : WINTER_CONFIG;

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
		return json(requestConfig);
	}

	const res = await got('/ac/v2/rcs/rsc/start', {
		method: 'POST',
		headers: {
			...defaultHeaders,
			offset: '-4',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			Ims: 0,
			airCtrl: 1,
			username: vehicle.userConfig.username,
			vin: vehicle.vehicleConfig.vin,
			igniOnDuration: 10,
			...requestConfig
		})
	});

	return new Response(res.statusMessage, { status: res.statusCode });
};