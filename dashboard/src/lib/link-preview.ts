export const URL_REGEX = /https?:\/\/[^\s<>"']+/i;

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
}