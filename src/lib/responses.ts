import { Schema } from "effect";

export class Result extends Schema.Struct({ status: Schema.Literal("ok", "success") }) {
  static Neutral = Result.make({ status: "ok" });
  static Success = Result.make({ status: "success" });
}

// Errors

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()("UnauthorizedError", {}) {}
