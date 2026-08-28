import { createApiClient, type ApiRequest, type ApiTransport } from "@spherepath/shared";
import { httpsCallable } from "firebase/functions";
import { firebaseServices } from "@/shared/firebase/client";

const transport: ApiTransport = async <TData, TResponse>({ endpoint, requestId, commandId, data }: {
  endpoint: string;
  requestId: string;
  commandId?: string;
  data: TData;
}) => {
  const callable = httpsCallable<ApiRequest<TData>, TResponse>(firebaseServices().functions, endpoint);
  return (await callable({ requestId, commandId, data })).data;
};

export const apiClient = createApiClient(transport, {
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onRequestComplete(event) {
    if (process.env.NODE_ENV === "development") console.debug("[api]", event);
  },
});
