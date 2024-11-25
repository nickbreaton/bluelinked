import { Array, Config, Effect, pipe } from "effect";
import { BlueLinky } from "bluelinky";
import { HttpBody, HttpClient } from "@effect/platform";

export type BlueLinkyConfig = ConstructorParameters<typeof BlueLinky>[0];

export interface StartOptions {
  airTemperature: number;
  defrost: boolean;
  driverSeatHeater: SeatTemperature;
  passengerSeatHeater: SeatTemperature;
}

export enum SeatTemperature {
  High = 8,
  Medium = 7,
  Low = 6,
}

export class BlueLinkyService extends Effect.Service<BlueLinkyService>()("BlueLinkyService", {
  effect: Effect.gen(function* () {
    const config: BlueLinkyConfig = {
      username: yield* Config.string("BLUELINKY_USERNAME"),
      password: yield* Config.string("BLUELINKY_PASSWORD"),
      brand: yield* Config.literal("hyundai", "kia")("BLUELINKY_BRAND"),
      region: yield* Config.literal("US")("BLUELINKY_REGION"),
      pin: yield* Config.string("BLUELINKY_PIN"),
      autoLogin: false,
    };

    const httpClient = yield* HttpClient.HttpClient;

    const fetchClient = yield* pipe(
      Effect.gen(function* () {
        const client = new BlueLinky(config);
        yield* Effect.logInfo("> BlueLinky client created");
        yield* Effect.promise(() => client.login());
        yield* Effect.logInfo("< BlueLinky client ready");
        return client;
      }),
      Effect.withSpan("fetchClient"),
      Effect.cached, // creates the client lazily, but only once
    );

    const fetchVehicle = yield* pipe(
      Effect.gen(function* () {
        const client = yield* fetchClient;
        yield* Effect.logInfo("> Fetching vehicles");
        const vehicles = yield* Effect.promise(() => client.getVehicles());
        const vehicle = yield* Array.get(vehicles, 0);
        yield* Effect.logInfo(`< Fetched vehicle ${vehicle.vin()}`);
        return vehicle;
      }),
      Effect.orDie,
      Effect.withSpan("fetchVehicle"),
      Effect.cached,
    );

    return {
      fetchLocation: Effect.gen(function* () {
        const vehicle = yield* fetchVehicle;
        yield* Effect.logInfo(`> Fetching location`);
        const location = yield* Effect.promise(() => vehicle.location());
        yield* Effect.logInfo(`< Fetched location`);
        return location;
      }),
      start: (options: StartOptions) =>
        Effect.gen(function* () {
          const vehicle = yield* fetchVehicle;

          const headers: Record<string, unknown> =
            // @ts-ignore
            vehicle.getDefaultHeaders();

          const requestConfig = {
            airTemp: { unit: 1, value: String(options.airTemperature) },
            defrost: options.defrost,
            heating1: +options.defrost,
            seatHeaterVentInfo: {
              drvSeatHeatState: options.driverSeatHeater,
              astSeatHeatState: options.passengerSeatHeater,
            },
            Ims: 0,
            airCtrl: 1,
            username: vehicle.userConfig.username,
            vin: vehicle.vehicleConfig.vin,
            igniOnDuration: 10,
          };

          const res = yield* httpClient.post("https://api.telematics.hyundaiusa.com/ac/v2/rcs/rsc/start", {
            headers: { ...headers, offset: "-4", "Content-Type": "application/json" },
            body: yield* HttpBody.json(requestConfig),
          });

          if (res.status !== 200) {
            yield* Effect.dieMessage(yield* res.text);
          }
        }),
    };
  }),
}) {}
