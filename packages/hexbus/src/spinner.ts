import * as p from "@clack/prompts";

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
 * Creates a Clack-backed spinner.
 *
 * @param initialMessage - Message used when `start()` is called without an
 * explicit message.
 * @returns A spinner controller.
 */
export function createSpinner(initialMessage?: string): Spinner {
  const spinner = p.spinner();

  return {
    message(message: string) {
      spinner.message(message);
    },
    start(message?: string) {
      spinner.start(message || initialMessage || "Processing...");
    },
    stop(message?: string) {
      spinner.stop(message || "Done");
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
  const spinner = createSpinner(message);
  spinner.start();

  try {
    const result = await task();
    spinner.stop(options?.successMessage || "Done");
    return result;
  } catch (error) {
    spinner.stop(options?.errorMessage || "Failed");
    throw error;
  }
}
