import { HttpApiBuilder, HttpMiddleware, HttpServer } from "@effect/platform";
import { Layer } from "effect";
import { AppApiLive } from "..";

export const config = {
  path: "/*",
};

const layer = Layer.mergeAll(AppApiLive, HttpServer.layerContext);

const { handler } = HttpApiBuilder.toWebHandler(layer, {
  middleware: HttpMiddleware.logger,
});

export default handler;
