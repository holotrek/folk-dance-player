// Electron prefixes errors thrown by main-process handlers with
// "Error invoking remote method '<channel>': Error: ". Organizers should only see the message.
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
