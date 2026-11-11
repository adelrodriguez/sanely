/**
 * A random id, unique across every realm and bundle that may share a wire or a window, such as two
 * `connect` sessions or two `receivePort` calls. `getRandomValues` works outside secure contexts,
 * where `randomUUID` is missing.
 */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}
