import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
  HttpServer,
  HttpApp,
} from "@effect/platform";
// import { BunContext, BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Array, Config, Effect, Layer, ManagedRuntime, pipe, Redacted, Schema } from "effect";
import { BlueLinky } from "bluelinky";

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

class BaseApi extends HttpApiGroup.make("base").add(HttpApiEndpoint.get("root", "/").addSuccess(Result)) {}

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

const AppApiLive = HttpApiBuilder.api(AppApi).pipe(
  //
  Layer.provide(BaseApiLive),
  Layer.provide(AuthorizedApiLive),
  Layer.provide(AuthorizationMiddlewareLive),
  Layer.provide(BlueLinkyService.Default),
);

// const HttpLive = HttpApiBuilder.serve().pipe(
//   Layer.provide(AppApiLive),
//   Layer.provide(AuthorizationMiddlewareLive),
//   Layer.provide(BlueLinkyService.Default),
//   HttpServer.withLogAddress,
//   Layer.provide(BunHttpServer.layer({ port: 3000 })),
// );

// const runtime = ManagedRuntime.make(AppApiLive);

// Layer.launch(HttpLive).pipe(BunRuntime.runMain);

const { handler } = HttpApiBuilder.toWebHandler(Layer.mergeAll(AppApiLive, HttpServer.layerContext));

export default {
  fetch: handler,
};
