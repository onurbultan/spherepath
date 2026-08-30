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
