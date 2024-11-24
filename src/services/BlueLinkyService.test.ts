import { it, expect } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, pipe } from "effect";
import { BlueLinkyService } from "./BlueLinkyService";
import { vi } from "vitest";
import { BlueLinky } from "bluelinky";

const mockLogin = vi.fn(async () => {});

vi.mock("bluelinky", () => {
  return {
    BlueLinky: vi.fn().mockImplementation(function (this: BlueLinky) {
      Object.assign(this, {
        login: mockLogin,
        getVehicles: vi.fn(async () => [
          {
            vin: vi.fn(),
            location: vi.fn(async () => {}),
          },
        ]),
      });
    }),
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
);

it.effect("lazy initializes and logs in", () =>
  Effect.gen(function* () {
    const { fetchLocation } = yield* BlueLinkyService;

    expect(BlueLinky).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();

    yield* fetchLocation;

    expect(BlueLinky).toHaveBeenCalledWith({
      brand: "hyundai",
      region: "US",
      username: "test-user",
      password: "test-password",
      pin: "0000",
      autoLogin: false,
    });
    expect(mockLogin).toHaveBeenCalled();
  }).pipe(Effect.provide(mockLayer)),
);
