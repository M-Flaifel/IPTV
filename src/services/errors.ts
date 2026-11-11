/** Maps an unknown thrown value to short, safe-to-display copy. */
export function errorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return 'Could not reach the server. Check the address and your connection.';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}
