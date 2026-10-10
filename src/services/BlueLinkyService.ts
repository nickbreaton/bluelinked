import { Array, Config, Context, Effect, Layer, Option, pipe } from "effect";
import { BlueLinky } from "bluelinky";
import { HttpBody, HttpClient } from "effect/http";

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

const make = Effect.gen(function* () {
  const config: BlueLinkyConfig = {
    username: yield* Config.String("BLUELINKY_USERNAME"),
    password: yield* Config.String("BLUELINKY_PASSWORD"),
    brand: yield* Config.Literals(["hyundai", "kia"], "BLUELINKY_BRAND"),
    region: yield* Config.Literal("US", "BLUELINKY_REGION"),
    pin: yield* Config.String("BLUELINKY_PIN"),
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
      const vehicle = yield* Option.match(Array.get(vehicles, 0), {
        onNone: () => Effect.die("No BlueLink vehicles found"),
        onSome: Effect.succeed,
      });
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
    start: Effect.fn("BlueLinkyService.start")(function* (options: StartOptions) {
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
        return yield* Effect.die(yield* res.text);
      }
    }),
  };
});

export class BlueLinkyService extends Context.Service<BlueLinkyService, Effect.Success<typeof make>>()(
  "shortkeys/services/BlueLinkyService",
) {
  static readonly layer = Layer.effect(BlueLinkyService, make);
}
