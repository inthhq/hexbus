import { openTuiMessage } from "./opentui";

/**
 * Minimal spinner controller used for long-running CLI tasks.
 */
export interface Spinner {
  /**
   * Starts the spinner with an optional message override.
   */
  start(message?: string): void;
  /**
   * Stops the spinner with an optional completion message.
   */
  stop(message?: string): void;
  /**
   * Updates the spinner message while it is running.
   */
  message(message: string): void;
}

/**
 * Creates an OpenTUI-backed spinner-compatible progress reporter.
 *
 * @param initialMessage - Message used when `start()` is called without an
 * explicit message.
 * @returns A spinner controller.
 */
export function createSpinner(initialMessage = "Processing..."): Spinner {
  let currentMessage = initialMessage;
  let running = false;

  return {
    message(message: string) {
      currentMessage = message;
      if (running) {
        openTuiMessage(`... ${message}`);
      }
    },
    start(message?: string) {
      currentMessage = message ?? currentMessage;
      running = true;
      openTuiMessage(`... ${currentMessage}`);
    },
    stop(message?: string) {
      running = false;
      openTuiMessage(message ?? "Done");
    },
  };
}

/**
 * Runs an async task while displaying a spinner.
 *
 * @typeParam T - Value returned by the task.
 * @param message - Message shown when the spinner starts.
 * @param task - Async work to run.
 * @param options - Optional success and error messages shown when the task
 * settles.
 * @returns The value returned by `task`.
 *
 * @throws Re-throws any error from `task` after stopping the spinner.
 */
export async function withSpinner<T>(
  message: string,
  task: () => Promise<T>,
  options?: {
    successMessage?: string;
    errorMessage?: string;
  }
): Promise<T> {
  const spinnerInstance = createSpinner(message);
  spinnerInstance.start();

  try {
    const result = await task();
    spinnerInstance.stop(options?.successMessage ?? "Done");
    return result;
  } catch (error) {
    spinnerInstance.stop(options?.errorMessage ?? "Failed");
    throw error;
  }
}
