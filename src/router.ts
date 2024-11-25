import { FetchHttpClient, HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";

import { Effect, Layer, pipe } from "effect";
import { Result, UnauthorizedError } from "./lib/responses";
import { BlueLinkyService, SeatTemperature } from "./services/BlueLinkyService";
import { AuthorizationMiddleware, AuthorizationMiddlewareLive } from "./middleware/authorization";

// Definition

class BaseApi extends HttpApiGroup.make("base") // ↩
  .add(HttpApiEndpoint.get("root", "/").addSuccess(Result)) {}

class AuthorizedApi extends HttpApiGroup.make("authorized")
  .add(HttpApiEndpoint.post("ping", "/ping").addSuccess(Result))
  .add(HttpApiEndpoint.post("start", "/start").addSuccess(Result))
  .middleware(AuthorizationMiddleware) {}

export class AppApi extends HttpApi.empty // ↩
  .add(BaseApi)
  .add(AuthorizedApi)
  .addError(UnauthorizedError, { status: 401 }) {}

// Live

const AuthorizedApiLive = HttpApiBuilder.group(AppApi, "authorized", (handlers) =>
  handlers // ↩
    .handle("ping", PingLive)
    .handle("start", StartLive),
);

const BaseApiLive = HttpApiBuilder.group(AppApi, "base", (handlers) =>
  handlers // ↩
    .handle("root", () => Effect.succeed(Result.Neutral)),
);

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

export const AppApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide(BaseApiLive),
  Layer.provide(AuthorizedApiLive),
  Layer.provide(AuthorizationMiddlewareLive),
  Layer.provide(BlueLinkyService.Default),
  Layer.provide(FetchHttpClient.layer),
);
