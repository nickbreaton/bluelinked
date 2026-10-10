import { HttpApiMiddleware, HttpApiSecurity } from "effect/http-api";
import { UnauthorizedError } from "../lib/responses";
import { Config, Effect, Layer, Redacted } from "effect";

export class AuthorizationMiddleware extends HttpApiMiddleware.Service<AuthorizationMiddleware>()(
  "AuthorizationMiddleware",
  {
    error: UnauthorizedError,
    security: { bearer: HttpApiSecurity.bearer },
  },
) {}

export const AuthorizationMiddlewareLive = Layer.effect(
  AuthorizationMiddleware,
  Effect.gen(function* () {
    const secret = yield* Config.String("SHARED_SECRET");
    return AuthorizationMiddleware.of({
      bearer: Effect.fn(function* (httpEffect, { credential }) {
        if (Redacted.value(credential) !== secret) {
          return yield* new UnauthorizedError({});
        }
        return yield* httpEffect;
      }),
    });
  }),
);
