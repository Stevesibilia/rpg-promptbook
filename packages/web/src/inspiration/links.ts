// «it.wikipedia.org» for https://it.wikipedia.org/wiki/…, without a leading
// «www.»; '' for anything that does not parse.
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
