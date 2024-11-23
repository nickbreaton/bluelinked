import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { Layer } from "effect";
import { AppApiLive } from ".";

const { handler } = HttpApiBuilder.toWebHandler(Layer.mergeAll(AppApiLive, HttpServer.layerContext));

export default {
  fetch: handler,
};
