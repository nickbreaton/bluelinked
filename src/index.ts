import {
  FetchHttpClient,
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
  HttpApp,
  HttpBody,
  HttpClient,
  HttpServerResponse,
} from "@effect/platform";
import { Array, Config, Effect, Layer, pipe, Redacted, Schema } from "effect";
import { BlueLinky } from "bluelinky";

class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}

class Result extends Schema.Struct({ status: Schema.Literal("ok", "success") }) {
  static Neutral = Result.make({ status: "ok" });
  static Success = Result.make({ status: "success" });
}

type BlueLinkyConfig = ConstructorParameters<typeof BlueLinky>[0];

export enum SeatTemperature {
  High = 8,
  Medium = 7,
  Low = 6,
}

export interface StartOptions {
  airTemperature: number;
  defrost: boolean;
  driverSeatHeater: SeatTemperature;
  passengerSeatHeater: SeatTemperature;
}

const PingLive = () =>
  Effect.gen(function* () {
    const { fetchLocation } = yield* BlueLinkyService;
    yield* fetchLocation;
    return Result.Success;
  });

const StartLive = () =>
  Effect.gen(function* () {
    const { start } = yield* BlueLinkyService;

    yield* pipe(
      start({
        airTemperature: 74,
        defrost: true,
        driverSeatHeater: SeatTemperature.High,
        passengerSeatHeater: SeatTemperature.High,
      }),
      Effect.orDie,
    );

    return Result.Success;
  });

class BlueLinkyService extends Effect.Service<BlueLinkyService>()("BlueLinkyService", {
  effect: Effect.gen(function* () {
    const config: BlueLinkyConfig = {
      username: yield* Config.string("BLUELINKY_USERNAME"),
      password: yield* Config.string("BLUELINKY_PASSWORD"),
      brand: yield* Config.literal("hyundai", "kia")("BLUELINKY_BRAND"),
      region: yield* Config.literal("US")("BLUELINKY_REGION"),
      pin: yield* Config.string("BLUELINKY_PIN"),
    };

    const fetchClient = yield* pipe(
      Effect.gen(function* () {
        const client = new BlueLinky(config);
        yield* Effect.logInfo("> BlueLinky client created");
        yield* Effect.async((resolve) => {
          client.on("ready", () => resolve(Effect.void));
        });
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
          const client = yield* HttpClient.HttpClient;

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

          const res = yield* client.post("https://api.telematics.hyundaiusa.com/ac/v2/rcs/rsc/start", {
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

export class MyHeaderMiddleware extends HttpApiMiddleware.Tag<MyHeaderMiddleware>()("MyHeaderMiddleware") {}

export const MyHeaderMiddlewareLive = Layer.succeed(
  MyHeaderMiddleware,
  HttpApp.appendPreResponseHandler((_req, res) => HttpServerResponse.setHeader(res, "tenantId", "123")),
);

class BaseApi extends HttpApiGroup.make("base")
  .add(HttpApiEndpoint.get("root", "/").addSuccess(Result))
  .middleware(MyHeaderMiddleware) {}

class AuthorizationMiddleware extends HttpApiMiddleware.Tag<AuthorizationMiddleware>()("AuthorizationMiddleware", {
  failure: Unauthorized,
  security: { bearer: HttpApiSecurity.bearer },
}) {}

const AuthorizationMiddlewareLive = Layer.effect(
  AuthorizationMiddleware,
  Effect.gen(function* () {
    const secret = yield* Config.string("SHARED_SECRET");
    return AuthorizationMiddleware.of({
      bearer: (bearerToken) =>
        Effect.gen(function* () {
          if (Redacted.value(bearerToken) !== secret) {
            yield* Effect.fail(Unauthorized.make());
          }
        }),
    });
  }),
);

class AuthorizedApi extends HttpApiGroup.make("authorized")
  .add(HttpApiEndpoint.post("ping", "/ping").addSuccess(Result))
  .add(HttpApiEndpoint.post("start", "/start").addSuccess(Result))
  .middleware(AuthorizationMiddleware) {}

class AppApi extends HttpApi.empty
  //
  .add(BaseApi)
  .add(AuthorizedApi)
  .addError(Unauthorized, { status: 401 }) {}

// Live

const AuthorizedApiLive = HttpApiBuilder.group(AppApi, "authorized", (handlers) =>
  handlers.handle("ping", PingLive).handle("start", StartLive),
);

const BaseApiLive = HttpApiBuilder.group(AppApi, "base", (handlers) =>
  handlers.handle("root", () => Effect.succeed(Result.Neutral)),
);

export const AppApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide(BaseApiLive),
  Layer.provide(AuthorizedApiLive),
  Layer.provide(AuthorizationMiddlewareLive),
  Layer.provide(MyHeaderMiddlewareLive),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(BlueLinkyService.Default),
);
