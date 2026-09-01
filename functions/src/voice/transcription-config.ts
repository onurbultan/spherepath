export const primarySpeechTarget = {
  model: "chirp_3",
  location: "eu",
  apiEndpoint: "eu-speech.googleapis.com",
} as const;

export const fallbackSpeechTarget = {
  model: "long",
  location: "global",
  apiEndpoint: "speech.googleapis.com",
} as const;

export const emergencySpeechTarget = {
  model: "short",
  location: "global",
  apiEndpoint: "speech.googleapis.com",
} as const;

export type SpeechTarget = typeof primarySpeechTarget | typeof fallbackSpeechTarget | typeof emergencySpeechTarget;

/**
 * The synchronous Speech v2 `recognize` call accepts roughly a minute of audio.
 * Anything longer must go through `batchRecognize`, which reads the object from
 * Cloud Storage and runs as a long-running operation.
 */
export const syncRecognitionLimitMs = 55_000;

/**
 * Telephony recordings can arrive with each party on its own channel, which
 * removes the need to guess who said what. Recognising each channel separately
 * is only correct for those; a single-channel note must stay off, and not every
 * model accepts the feature, so the fallback chain still has to cover rejection.
 */
export const separateChannelRecognition = false;
