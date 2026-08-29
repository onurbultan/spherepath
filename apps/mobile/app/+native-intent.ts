export async function redirectSystemPath({ path }: { path: string; initial: boolean }): Promise<string> {
  try {
    const url = new URL(path, "spherepath://app");
    if (url.hostname === "expo-sharing" || url.pathname.includes("expo-sharing")) return "/share-received";
    return path;
  } catch {
    return "/";
  }
}
