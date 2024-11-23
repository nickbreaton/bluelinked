import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { Layer, ConfigProvider } from "effect";
import { AppApiLive } from ".";

export const config = {
  path: "/*",
};

const layer = Layer.mergeAll(AppApiLive, HttpServer.layerContext);

const { handler } = HttpApiBuilder.toWebHandler(layer);

export default async function (request: Request) {
  try {
    return await handler(request);
  } catch (error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  }
}
