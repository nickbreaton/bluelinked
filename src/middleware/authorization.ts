import { HttpApiMiddleware, HttpApiSecurity } from "@effect/platform";
import { UnauthorizedError } from "../lib/responses";
import { Config, Effect, Layer, Redacted } from "effect";

export class AuthorizationMiddleware extends HttpApiMiddleware.Tag<AuthorizationMiddleware>()(
  "AuthorizationMiddleware",
  {
    failure: UnauthorizedError,
    security: { bearer: HttpApiSecurity.bearer },
  },
) {}

export const AuthorizationMiddlewareLive = Layer.effect(
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
