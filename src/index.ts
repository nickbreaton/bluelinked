import {
  Headers,
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
  HttpApiError,
} from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Cause, Config, Effect, Layer, Option, pipe } from "effect";

const Start = Effect.gen(function* () {
  return HttpServerResponse.text("Hello World 123");
});

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
  HttpRouter.post("/start", Start),
  HttpRouter.use(withAuthorization),
  HttpRouter.get("/", HttpServerResponse.text("Ok")),
);

const app = router.pipe(
  Effect.tapError(Effect.logError),
  Effect.catchAllCause((cause) => {
    return HttpServerResponse.text(Cause.pretty(cause), { status: 500 });
  }),
  HttpServer.serve(),
  HttpServer.withLogAddress,
);

const ServerLive = BunHttpServer.layer({ port: 3000 });

BunRuntime.runMain(Layer.launch(Layer.provide(app, ServerLive)));
