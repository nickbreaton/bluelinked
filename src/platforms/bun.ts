import { HttpApiBuilder, HttpMiddleware, HttpServer } from "@effect/platform";
import { AppApiLive } from "../router";
import { Layer } from "effect";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";

HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  HttpServer.withLogAddress,
  Layer.provide(AppApiLive),
  Layer.provide(BunHttpServer.layer({ port: 3000 })),
  Layer.launch,
  BunRuntime.runMain,
);
