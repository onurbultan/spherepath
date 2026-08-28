export type ApiCallKind = "query" | "command";

export interface ApiRequest<TData> {
  requestId: string;
  data: TData;
  commandId?: string;
}

export interface ApiTransportRequest<TData> extends ApiRequest<TData> {
  endpoint: string;
}

export type ApiTransport = <TData, TResponse>(request: ApiTransportRequest<TData>) => Promise<TResponse>;

export type ApiErrorCategory = "auth" | "permission" | "validation" | "not_found" | "conflict" | "network" | "server" | "unknown";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly category: ApiErrorCategory,
    public readonly endpoint: string,
    public readonly requestId: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  createRequestId?: () => string;
  wait?: (milliseconds: number) => Promise<void>;
  onRequestComplete?: (event: {
    endpoint: string;
    kind: ApiCallKind;
    requestId: string;
    durationMs: number;
    succeeded: boolean;
  }) => void;
}

export interface ApiCallOptions {
  commandId?: string;
}

const retryableCodes = new Set(["internal", "unavailable", "deadline-exceeded", "resource-exhausted", "network-request-failed"]);

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function errorCode(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error) || typeof error.code !== "string") return "unknown";
  return error.code.replace(/^functions\//, "");
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  return "API request failed.";
}

function categoryFor(code: string): ApiErrorCategory {
  if (code === "unauthenticated") return "auth";
  if (code === "permission-denied") return "permission";
  if (code === "invalid-argument" || code === "failed-precondition" || code === "out-of-range") return "validation";
  if (code === "not-found") return "not_found";
  if (code === "already-exists" || code === "aborted") return "conflict";
  if (code === "network-request-failed" || code === "unavailable" || code === "deadline-exceeded") return "network";
  if (code === "internal" || code === "data-loss" || code === "unknown") return "server";
  return "unknown";
}

export function normalizeApiError(error: unknown, endpoint: string, requestId: string): ApiError {
  if (error instanceof ApiError) return error;
  const code = errorCode(error);
  return new ApiError(
    errorMessage(error),
    code,
    categoryFor(code),
    endpoint,
    requestId,
    retryableCodes.has(code),
    error,
  );
}

export function shouldRetryApiCall(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && error instanceof ApiError && error.retryable;
}

export function apiRetryDelay(failureCount: number): number {
  const base = Math.min(500 * 2 ** failureCount, 5_000);
  return Math.max(500, base * (0.5 + Math.random() * 0.5));
}

export function createApiClient(transport: ApiTransport, options: ApiClientOptions = {}) {
  async function call<TData, TResponse>(
    kind: ApiCallKind,
    endpoint: string,
    data: TData,
    callOptions: ApiCallOptions = {},
  ): Promise<TResponse> {
    const requestId = options.createRequestId?.() ?? createId();
    const startedAt = Date.now();
    let failureCount = 0;
    let succeeded = false;
    try {
      while (true) {
        try {
          const response = await transport<TData, TResponse>({ endpoint, requestId, commandId: callOptions.commandId, data });
          succeeded = true;
          return response;
        } catch (cause) {
          const error = normalizeApiError(cause, endpoint, requestId);
          const canRetry = kind === "command" && Boolean(callOptions.commandId);
          if (!canRetry || !shouldRetryApiCall(failureCount, error)) throw error;
          await (options.wait?.(apiRetryDelay(failureCount++)) ?? Promise.resolve());
        }
      }
    } finally {
      options.onRequestComplete?.({
        endpoint,
        kind,
        requestId,
        durationMs: Date.now() - startedAt,
        succeeded,
      });
    }
  }

  return {
    query: <TData, TResponse>(endpoint: string, data: TData) => call<TData, TResponse>("query", endpoint, data),
    command: <TData, TResponse>(endpoint: string, data: TData, commandId: string) =>
      call<TData, TResponse>("command", endpoint, data, { commandId }),
  };
}

export function createCommandId(ownerUid: string): string {
  return `${ownerUid}-${createId()}`;
}

export const apiQueryKeys = {
  contacts: ["contacts"] as const,
  todayOverview: ["today", "overview"] as const,
};
