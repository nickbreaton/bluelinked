import { FetchHttpClient } from "effect/http";
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { Effect, Layer, pipe } from "effect";
import { Result } from "./lib/responses";
import { BlueLinkyService, SeatTemperature } from "./services/BlueLinkyService";
import { AuthorizationMiddleware, AuthorizationMiddlewareLive } from "./middleware/authorization";

// Definition

class BaseApi extends HttpApiGroup.make("base") // ↩
  .add(HttpApiEndpoint.get("root", "/", { success: Result })) {}

class AuthorizedApi extends HttpApiGroup.make("authorized")
  .add(HttpApiEndpoint.post("ping", "/ping", { success: Result }))
  .add(HttpApiEndpoint.post("start", "/start", { success: Result }))
  .middleware(AuthorizationMiddleware) {}

export class AppApi extends HttpApi.make("AppApi") // ↩
  .add(BaseApi)
  .add(AuthorizedApi) {}

// Live

const AuthorizedApiLive = HttpApiBuilder.group(
  AppApi,
  "authorized",
  Effect.fn(function* (handlers) {
    const service = yield* BlueLinkyService;
    return handlers // ↩
      .handle("ping", PingLive(service))
      .handle("start", StartLive(service));
  }),
);

const BaseApiLive = HttpApiBuilder.group(AppApi, "base", (handlers) =>
  handlers // ↩
    .handle("root", () => Effect.succeed(Result.Neutral)),
);

const PingLive = ({ fetchLocation }: BlueLinkyService["Service"]) =>
  Effect.fn("ping")(function* () {
    yield* fetchLocation;
    return Result.Success;
  });

const StartLive = ({ start }: BlueLinkyService["Service"]) =>
  Effect.fn("start")(function* () {
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

export const AppApiHandlers = HttpApiBuilder.layer(AppApi).pipe(
  Layer.provide(BaseApiLive),
  Layer.provide(AuthorizedApiLive),
  Layer.provide(AuthorizationMiddlewareLive),
);

export const AppApiLive = AppApiHandlers.pipe(
  Layer.provide(BlueLinkyService.layer),
  Layer.provide(FetchHttpClient.layer),
);
