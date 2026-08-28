import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

interface ApiEnvelope<TData> {
  requestId: string;
  commandId?: string;
  data: TData;
}

function identifier(value: unknown, field: "requestId" | "commandId"): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 160) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return value;
}

export function readApiEnvelope<TData>(value: unknown, options: { command?: boolean } = {}): ApiEnvelope<TData> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "API request envelope is invalid.");
  }
  const input = value as Record<string, unknown>;
  return {
    requestId: identifier(input.requestId, "requestId"),
    commandId: options.command ? identifier(input.commandId, "commandId") : undefined,
    data: input.data as TData,
  };
}

export async function observeApiRequest<T>(
  endpoint: string,
  requestId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    logger.info("API request completed", { endpoint, requestId, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    logger.error("API request failed", { endpoint, requestId, durationMs: Date.now() - startedAt, error });
    throw error;
  }
}
