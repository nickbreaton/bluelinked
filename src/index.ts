import {
  FetchHttpClient,
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
} from "@effect/platform";

import { Config, Effect, Layer, pipe, Redacted } from "effect";
import { Result, UnauthorizedError } from "./lib/responses";
import { BlueLinkyService, SeatTemperature } from "./services/BlueLinkyService";

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

class BaseApi extends HttpApiGroup.make("base").add(HttpApiEndpoint.get("root", "/").addSuccess(Result)) {}

class AuthorizationMiddleware extends HttpApiMiddleware.Tag<AuthorizationMiddleware>()("AuthorizationMiddleware", {
  failure: UnauthorizedError,
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
            yield* Effect.fail(UnauthorizedError.make());
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
  .addError(UnauthorizedError, { status: 401 }) {}

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
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(BlueLinkyService.Default),
);
