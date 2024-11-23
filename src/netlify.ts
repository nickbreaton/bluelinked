import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { Layer, ConfigProvider } from "effect";
import { AppApiLive } from ".";

export const config = {
  path: "/*",
};

const layer = Layer.mergeAll(AppApiLive, HttpServer.layerContext);

const { handler } = HttpApiBuilder.toWebHandler(layer);

export default handler;
