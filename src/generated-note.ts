import type { GeneratedNoteMetadata } from "./settings";

export async function isGeneratedNoteUnchanged(
  content: string,
  metadata: GeneratedNoteMetadata,
): Promise<boolean> {
  const currentMetadata = await getGeneratedNoteMetadata(content);
  return currentMetadata.fingerprint === metadata.fingerprint;
}

export async function getGeneratedNoteMetadata(content: string): Promise<GeneratedNoteMetadata> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { fingerprint };
}
