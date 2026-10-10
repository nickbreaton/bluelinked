import { HttpRouter } from "effect/http";
import { AppApiLive } from "../router";
import { Layer } from "effect";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";

HttpRouter.serve(AppApiLive).pipe(Layer.provide(BunHttpServer.layer({ port: 3000 })), Layer.launch, BunRuntime.runMain);
