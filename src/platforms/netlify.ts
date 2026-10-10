import { HttpRouter, HttpServer } from "effect/http";
import { AppApiLive } from "../router";
import { Layer } from "effect";

export const config = {
  path: "/*",
};

const { handler } = HttpRouter.toWebHandler(AppApiLive.pipe(Layer.provide(HttpServer.layerServices)));

export default handler;
