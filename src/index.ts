import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
  HttpApp,
  HttpServerResponse,
} from "@effect/platform";
import { Array, Config, Effect, Layer, pipe, Redacted, Schema } from "effect";
import type { BlueLinky } from "bluelinky";

class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}

class Result extends Schema.Struct({ status: Schema.Literal("ok", "success") }) {
  static Neutral = Result.make({ status: "ok" });
  static Success = Result.make({ status: "success" });
}

type BlueLinkyConfig = ConstructorParameters<typeof BlueLinky>[0];
type VehicleStartOptions = Parameters<NonNullable<Awaited<ReturnType<BlueLinky["getVehicle"]>>>["start"]>[0];

const PingLive = () =>
  Effect.gen(function* () {
    const { fetchLocation } = yield* BlueLinkyService;
    yield* fetchLocation;
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
        globalThis.WeakMap ??= globalThis.Map;
        const { default: BlueLinky } = yield* Effect.promise(() => import("bluelinky"));

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
      start: (options: VehicleStartOptions) =>
        Effect.gen(function* () {
          const vehicle = yield* fetchVehicle;
          yield* Effect.promise(() => vehicle.start(options));
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
  .middleware(AuthorizationMiddleware) {}

class AppApi extends HttpApi.empty
  //
  .add(BaseApi)
  .add(AuthorizedApi)
  .addError(Unauthorized, { status: 401 }) {}

// Live

const AuthorizedApiLive = HttpApiBuilder.group(AppApi, "authorized", (handlers) => handlers.handle("ping", PingLive));

const BaseApiLive = HttpApiBuilder.group(AppApi, "base", (handlers) =>
  handlers.handle("root", () => Effect.succeed(Result.Neutral)),
);

export const AppApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide(BaseApiLive),
  Layer.provide(AuthorizedApiLive),
  Layer.provide(AuthorizationMiddlewareLive),
  Layer.provide(MyHeaderMiddlewareLive),
  Layer.provide(BlueLinkyService.Default),
);
