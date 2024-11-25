import { it, expect } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, pipe } from "effect";
import { HttpBody, HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { BlueLinkyService, SeatTemperature } from "./BlueLinkyService";
import { vi } from "vitest";
import { BlueLinky } from "bluelinky";

const mocks = vi.hoisted(() => {
  const vehicle = {
    vin: vi.fn().mockReturnValue("VIN"),
    location: vi.fn().mockResolvedValue({}),
    getDefaultHeaders: vi.fn(() => ({ "X-Bluelink-Header": "1" })),
    userConfig: {
      vin: "VIN",
    },
    vehicleConfig: {
      username: "test-user",
    },
  };
  return {
    login: vi.fn().mockResolvedValue("success"),
    getVehicles: vi.fn(async () => [vehicle]),
    vehicle,
    request: vi.fn((req) => Effect.succeed(HttpClientResponse.fromWeb(req, new Response("asd")))),
  };
});

vi.mock("bluelinky", () => {
  return {
    BlueLinky: vi.fn(() => ({
      login: mocks.login,
      getVehicles: mocks.getVehicles,
    })),
  };
});

const mockLayer = BlueLinkyService.Default.pipe(
  Layer.provide(
    Layer.setConfigProvider(
      ConfigProvider.fromJson({
        BLUELINKY_USERNAME: "test-user",
        BLUELINKY_PASSWORD: "test-password",
        BLUELINKY_BRAND: "hyundai",
        BLUELINKY_REGION: "US",
        BLUELINKY_PIN: "0000",
      }),
    ),
  ),
  Layer.provide(Layer.succeed(HttpClient.HttpClient, HttpClient.make(mocks.request))),
);

it.effect("lazy initializes and logs in", () =>
  Effect.gen(function* () {
    const { fetchLocation } = yield* BlueLinkyService;

    expect(BlueLinky).not.toHaveBeenCalled();
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.vehicle.location).not.toHaveBeenCalled();

    yield* fetchLocation;

    expect(BlueLinky).toHaveBeenCalledWith({
      brand: "hyundai",
      region: "US",
      username: "test-user",
      password: "test-password",
      pin: "0000",
      autoLogin: false,
    });
    expect(mocks.login).toHaveBeenCalled();
    expect(mocks.vehicle.location).toHaveBeenCalled();
  }).pipe(Effect.provide(mockLayer)),
);

it.scoped("can remote start", () =>
  Effect.gen(function* () {
    const { start } = yield* BlueLinkyService;

    yield* start({
      airTemperature: 69,
      defrost: true,
      driverSeatHeater: SeatTemperature.High,
      passengerSeatHeater: SeatTemperature.Low,
    });

    const request: HttpClientRequest.HttpClientRequest = mocks.request.mock.lastCall?.[0];

    expect(request.url).toEqual("https://api.telematics.hyundaiusa.com/ac/v2/rcs/rsc/start");
    expect(request.headers).toEqual(expect.objectContaining({ "x-bluelink-header": "1" }));
  }).pipe(Effect.provide(mockLayer)),
);
