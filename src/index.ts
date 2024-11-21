import {
  Headers,
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Array, Cause, Config, Effect, Layer, Option, pipe } from "effect";
import { BlueLinky } from "bluelinky";

type BlueLinkConfig = ConstructorParameters<typeof BlueLinky>[0];
type VehicleStartOptions = Parameters<NonNullable<Awaited<ReturnType<BlueLinky["getVehicle"]>>>["start"]>[0];

const Location = Effect.gen(function* () {
  const { fetchLocation } = yield* BlueLinkyService;
  return HttpServerResponse.text(JSON.stringify(yield* fetchLocation, null, 2));
});

class BlueLinkyService extends Effect.Service<BlueLinkyService>()("BlueLinkyService", {
  effect: Effect.gen(function* () {
    const config: BlueLinkConfig = {
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

const withAuthorization = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const { headers } = yield* HttpServerRequest.HttpServerRequest;
    const secret = yield* Config.string("SHARED_SECRET");

    const token = pipe(
      headers,
      Headers.get("Authorization"),
      Option.map((header) => header.split("Bearer ").at(1)),
      Option.flatMap(Option.fromNullable),
    );

    if (Option.isSome(token) && token.value === secret) {
      return yield* app;
    }

    return HttpServerResponse.text("Unauthorized", { status: 401 });
  }),
);

const router = HttpRouter.empty.pipe(
  HttpRouter.post("/location", Location),
  HttpRouter.use(withAuthorization),
  HttpRouter.get("/", HttpServerResponse.text("Ok")),
);

router.pipe(
  Effect.tapError(Effect.logError),
  Effect.catchAllCause((cause) => HttpServerResponse.text(Cause.pretty(cause), { status: 500 })),
  HttpServer.serve(),
  HttpServer.withLogAddress,
  Layer.provide(BlueLinkyService.Default),
  Layer.provide(BunHttpServer.layer({ port: 3000 })),
  Layer.launch,
  BunRuntime.runMain,
);
