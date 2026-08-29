import { describe, expect, it } from "vitest";
import { microphoneErrorMessage, microphoneErrorMessages } from "./microphone-error.js";

describe("microphone error copy", () => {
  it.each([
    ["NotAllowedError", microphoneErrorMessages.permissionDenied],
    ["NotFoundError", microphoneErrorMessages.notFound],
    ["NotReadableError", microphoneErrorMessages.inUse],
    ["AbortError", microphoneErrorMessages.interrupted],
    ["SecurityError", microphoneErrorMessages.insecure],
  ])("maps %s to actionable Turkish copy", (name, expected) => {
    expect(microphoneErrorMessage({ name })).toBe(expected);
  });

  it("preserves an actionable unknown error message", () => {
    expect(microphoneErrorMessage(new Error("Kayıt oturumu kapandı."))).toBe("Kayıt oturumu kapandı.");
  });
});
