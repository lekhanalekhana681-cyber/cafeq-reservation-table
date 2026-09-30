let lastCapturedError: Error | null = null;

export function captureError(error: Error) {
  lastCapturedError = error;
}

export function consumeLastCapturedError(): Error | null {
  const err = lastCapturedError;
  lastCapturedError = null;
  return err;
}
