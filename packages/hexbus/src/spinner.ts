import * as p from '@clack/prompts';

export interface Spinner {
	start(message?: string): void;
	stop(message?: string): void;
	message(message: string): void;
}

export function createSpinner(initialMessage?: string): Spinner {
	const spinner = p.spinner();

	return {
		start(message?: string) {
			spinner.start(message || initialMessage || 'Processing...');
		},
		stop(message?: string) {
			spinner.stop(message || 'Done');
		},
		message(message: string) {
			spinner.message(message);
		},
	};
}

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
		spinner.stop(options?.successMessage || 'Done');
		return result;
	} catch (error) {
		spinner.stop(options?.errorMessage || 'Failed');
		throw error;
	}
}
