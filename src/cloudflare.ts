import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { Layer, ConfigProvider } from "effect";
import { AppApiLive } from ".";

export default {
  fetch(request: Request, env: Record<string, string>) {
    const layer = Layer.mergeAll(AppApiLive, HttpServer.layerContext).pipe(
      Layer.provide(Layer.setConfigProvider(ConfigProvider.fromJson(env))),
    );

    const { handler } = HttpApiBuilder.toWebHandler(layer);

    return handler(request);
  },
};
