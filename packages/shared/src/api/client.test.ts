import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, normalizeApiError, shouldRetryApiCall } from "./client.js";

describe("API client", () => {
  it("sends request metadata through the transport", async () => {
    const transport = vi.fn(async (request: { data: unknown }) => ({ echoed: request.data })) as unknown as Parameters<typeof createApiClient>[0];
    const client = createApiClient(transport, { createRequestId: () => "request-123" });
    await expect(client.query("listContacts", { page: 1 })).resolves.toEqual({ echoed: { page: 1 } });
    expect(transport).toHaveBeenCalledWith({ endpoint: "listContacts", requestId: "request-123", data: { page: 1 } });
  });

  it("normalizes Firebase callable errors", () => {
    const error = normalizeApiError({ code: "functions/permission-denied", message: "Denied" }, "listContacts", "req-1");
    expect(error).toMatchObject({ code: "permission-denied", category: "permission", endpoint: "listContacts", requestId: "req-1", retryable: false });
  });

  it("retries only transient normalized errors within the limit", () => {
    const error = new ApiError("Offline", "unavailable", "network", "health", "req-2", true);
    expect(shouldRetryApiCall(0, error)).toBe(true);
    expect(shouldRetryApiCall(2, error)).toBe(false);
  });

  it("reports normalized diagnostics without request data", async () => {
    const complete = vi.fn();
    const client = createApiClient(async () => { throw { code: "functions/unavailable", message: "Offline" }; }, {
      createRequestId: () => "request-diagnostic",
      onRequestComplete: complete,
    });
    await expect(client.query("listContacts", undefined)).rejects.toMatchObject({ category: "network" });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "listContacts",
      requestId: "request-diagnostic",
      succeeded: false,
      attemptCount: 1,
      errorCode: "unavailable",
      errorCategory: "network",
    }));
    expect(JSON.stringify(complete.mock.calls)).not.toContain("data");
  });
});
