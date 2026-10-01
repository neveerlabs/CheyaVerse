export async function readApiJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body) {
    throw new Error(
      response.ok
        ? "Server returned an empty response. Please try again."
        : `Request failed (HTTP ${response.status}). Please try again.`,
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(
      response.ok
        ? "Server returned an invalid response. Please try again."
        : `Request failed (HTTP ${response.status}). Please try again.`,
    );
  }
}
