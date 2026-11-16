import { ConfigProvider, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { AppApiHandlers } from "./router";
import { BlueLinkyService, SeatTemperature } from "./services/BlueLinkyService";

const fetchLocation = vi.fn(() =>
  Effect.succeed({
    latitude: 0,
    longitude: 0,
    altitude: 0,
    speed: { unit: 0, value: 0 },
    heading: 0,
  }),
);
const start = vi.fn(() => Effect.succeed(undefined));
const lock = vi.fn(() => Effect.succeed(undefined));

const { handler, dispose } = HttpRouter.toWebHandler(
  AppApiHandlers.pipe(
    Layer.provide(Layer.succeed(BlueLinkyService, { fetchLocation: Effect.suspend(fetchLocation), start, lock })),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SHARED_SECRET: "test-secret" }))),
    Layer.provide(HttpServer.layerServices),
  ),
  { disableLogger: true },
);

afterAll(dispose);
beforeEach(() => vi.clearAllMocks());

it("serves the public root without authentication", async () => {
  const response = await handler(new Request("http://localhost/"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(fetchLocation).not.toHaveBeenCalled();
});

it.each(["/ping", "/start", "/lock"])("rejects missing and invalid credentials for %s", async (path) => {
  for (const headers of [new Headers(), new Headers({ Authorization: "Bearer wrong-secret" })]) {
    const response = await handler(new Request(`http://localhost${path}`, { method: "POST", headers }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ _tag: "UnauthorizedError" });
  }
  expect(fetchLocation).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  expect(lock).not.toHaveBeenCalled();
});

it("runs authenticated ping, start, and lock handlers", async () => {
  for (const path of ["/ping", "/start", "/lock"]) {
    const response = await handler(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "success" });
  }
  expect(fetchLocation).toHaveBeenCalledOnce();
  expect(lock).toHaveBeenCalledOnce();
  expect(start).toHaveBeenCalledExactlyOnceWith({
    airTemperature: 74,
    defrost: true,
    driverSeatHeater: SeatTemperature.High,
    passengerSeatHeater: SeatTemperature.High,
  });
});
