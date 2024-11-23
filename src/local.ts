import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { AppApiLive } from ".";
import { Layer } from "effect";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";

HttpApiBuilder.serve().pipe(
  Layer.provide(AppApiLive),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({ port: 3000 })),
  Layer.launch,
  BunRuntime.runMain,
);
