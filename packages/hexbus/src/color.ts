/**
 * Formats an arbitrary value as a string, optionally wrapping it in ANSI
 * escape codes.
 */
export type ColorFormatter = (input: unknown) => string;

/**
 * Collection of ANSI style and color formatters.
 *
 * @remarks
 * When color is disabled, every formatter returns the input converted with
 * `String(input)` and does not add escape codes.
 */
export interface Colors {
	/**
	 * Whether this formatter set emits ANSI escape codes.
	 */
	isColorSupported: boolean;
	/** Resets all ANSI styles. */
	reset: ColorFormatter;
	/** Applies bold text styling. */
	bold: ColorFormatter;
	/** Applies dim text styling. */
	dim: ColorFormatter;
	/** Applies italic text styling. */
	italic: ColorFormatter;
	/** Applies underline text styling. */
	underline: ColorFormatter;
	/** Applies inverse foreground/background styling. */
	inverse: ColorFormatter;
	/** Applies hidden text styling. */
	hidden: ColorFormatter;
	/** Applies strikethrough text styling. */
	strikethrough: ColorFormatter;
	/** Applies black foreground color. */
	black: ColorFormatter;
	/** Applies red foreground color. */
	red: ColorFormatter;
	/** Applies green foreground color. */
	green: ColorFormatter;
	/** Applies yellow foreground color. */
	yellow: ColorFormatter;
	/** Applies blue foreground color. */
	blue: ColorFormatter;
	/** Applies magenta foreground color. */
	magenta: ColorFormatter;
	/** Applies cyan foreground color. */
	cyan: ColorFormatter;
	/** Applies white foreground color. */
	white: ColorFormatter;
	/** Applies gray foreground color. */
	gray: ColorFormatter;
	/** Applies black background color. */
	bgBlack: ColorFormatter;
	/** Applies red background color. */
	bgRed: ColorFormatter;
	/** Applies green background color. */
	bgGreen: ColorFormatter;
	/** Applies yellow background color. */
	bgYellow: ColorFormatter;
	/** Applies blue background color. */
	bgBlue: ColorFormatter;
	/** Applies magenta background color. */
	bgMagenta: ColorFormatter;
	/** Applies cyan background color. */
	bgCyan: ColorFormatter;
	/** Applies white background color. */
	bgWhite: ColorFormatter;
	/** Applies bright black foreground color. */
	blackBright: ColorFormatter;
	/** Applies bright red foreground color. */
	redBright: ColorFormatter;
	/** Applies bright green foreground color. */
	greenBright: ColorFormatter;
	/** Applies bright yellow foreground color. */
	yellowBright: ColorFormatter;
	/** Applies bright blue foreground color. */
	blueBright: ColorFormatter;
	/** Applies bright magenta foreground color. */
	magentaBright: ColorFormatter;
	/** Applies bright cyan foreground color. */
	cyanBright: ColorFormatter;
	/** Applies bright white foreground color. */
	whiteBright: ColorFormatter;
	/** Applies bright black background color. */
	bgBlackBright: ColorFormatter;
	/** Applies bright red background color. */
	bgRedBright: ColorFormatter;
	/** Applies bright green background color. */
	bgGreenBright: ColorFormatter;
	/** Applies bright yellow background color. */
	bgYellowBright: ColorFormatter;
	/** Applies bright blue background color. */
	bgBlueBright: ColorFormatter;
	/** Applies bright magenta background color. */
	bgMagentaBright: ColorFormatter;
	/** Applies bright cyan background color. */
	bgCyanBright: ColorFormatter;
	/** Applies bright white background color. */
	bgWhiteBright: ColorFormatter;
}

/**
 * Inputs used to detect whether ANSI color should be enabled.
 *
 * @remarks
 * The options exist mostly for tests and embedded runtimes. Callers normally
 * use the process defaults.
 */
export interface ColorSupportOptions {
	/**
	 * Command-line arguments to inspect for `--color` and `--no-color`.
	 *
	 * @default process.argv
	 */
	argv?: readonly string[];
	/**
	 * Environment variables to inspect for `FORCE_COLOR`, `NO_COLOR`, and `CI`.
	 *
	 * @default process.env
	 */
	env?: NodeJS.ProcessEnv;
	/**
	 * Platform identifier used for Windows color support defaults.
	 *
	 * @default process.platform
	 */
	platform?: NodeJS.Platform | string;
	/**
	 * Output stream used to inspect TTY support.
	 *
	 * @default process.stdout
	 */
	stdout?: Pick<NodeJS.WriteStream, 'isTTY'>;
}

/**
 * Default color formatter object plus a factory for creating formatter sets
 * with explicit color support.
 */
export type Color = Colors & { createColors: typeof createColors };

const createFormatter =
	(open: string, close: string, replace = open): ColorFormatter =>
	(input: unknown) => {
		const string = String(input);
		const index = string.indexOf(close, open.length);
		return index === -1
			? open + string + close
			: open + replaceClose(string, close, replace, index) + close;
	};

const replaceClose = (
	string: string,
	close: string,
	replace: string,
	startIndex: number
): string => {
	let result = '';
	let cursor = 0;
	let index = startIndex;

	do {
		result += string.slice(cursor, index) + replace;
		cursor = index + close.length;
		index = string.indexOf(close, cursor);
	} while (index !== -1);

	return result + string.slice(cursor);
};

/**
 * Detects whether ANSI color output should be enabled.
 *
 * @remarks
 * Detection follows common CLI conventions: `NO_COLOR`, `--no-color`, and
 * `FORCE_COLOR=0` disable colors; `FORCE_COLOR` and `--color` enable colors;
 * Windows defaults to enabled; otherwise TTY, non-dumb terminals, and CI
 * environments are considered color-capable.
 *
 * @param options - Optional process-like inputs for detection.
 * @returns `true` when color formatters should emit ANSI escape codes.
 */
export function detectColorSupport(options: ColorSupportOptions = {}): boolean {
	const argv = options.argv ?? process.argv;
	const env = options.env ?? process.env;
	const platform = options.platform ?? process.platform;
	const stdout = options.stdout ?? process.stdout;
	const forceColor = env.FORCE_COLOR?.toLowerCase();
	const hasNoColor = Object.hasOwn(env, 'NO_COLOR');
	const isCI = Object.hasOwn(env, 'CI');
	const isForceColorDisabled = forceColor === '0' || forceColor === 'false';
	const isDisabled =
		hasNoColor || argv.includes('--no-color') || isForceColorDisabled;

	if (isDisabled) {
		return false;
	}

	if (
		(forceColor !== undefined &&
			forceColor !== '0' &&
			forceColor !== 'false') ||
		argv.includes('--color')
	) {
		return true;
	}

	if (platform === 'win32') {
		return true;
	}

	return (Boolean(stdout.isTTY) && env.TERM !== 'dumb') || isCI;
}

/**
 * Process-level color support detected at module load time.
 */
export const isColorSupported = detectColorSupport();

/**
 * Creates a complete set of color and style formatters.
 *
 * @param enabled - Whether returned formatters should emit ANSI escape codes.
 * @returns A `Colors` object with either active ANSI formatters or plain string
 * pass-through formatters.
 */
export function createColors(enabled = isColorSupported): Colors {
	const formatter = enabled ? createFormatter : () => String;

	return {
		isColorSupported: enabled,
		reset: formatter('\x1b[0m', '\x1b[0m'),
		bold: formatter('\x1b[1m', '\x1b[22m', '\x1b[22m\x1b[1m'),
		dim: formatter('\x1b[2m', '\x1b[22m', '\x1b[22m\x1b[2m'),
		italic: formatter('\x1b[3m', '\x1b[23m'),
		underline: formatter('\x1b[4m', '\x1b[24m'),
		inverse: formatter('\x1b[7m', '\x1b[27m'),
		hidden: formatter('\x1b[8m', '\x1b[28m'),
		strikethrough: formatter('\x1b[9m', '\x1b[29m'),
		black: formatter('\x1b[30m', '\x1b[39m'),
		red: formatter('\x1b[31m', '\x1b[39m'),
		green: formatter('\x1b[32m', '\x1b[39m'),
		yellow: formatter('\x1b[33m', '\x1b[39m'),
		blue: formatter('\x1b[34m', '\x1b[39m'),
		magenta: formatter('\x1b[35m', '\x1b[39m'),
		cyan: formatter('\x1b[36m', '\x1b[39m'),
		white: formatter('\x1b[37m', '\x1b[39m'),
		gray: formatter('\x1b[90m', '\x1b[39m'),
		bgBlack: formatter('\x1b[40m', '\x1b[49m'),
		bgRed: formatter('\x1b[41m', '\x1b[49m'),
		bgGreen: formatter('\x1b[42m', '\x1b[49m'),
		bgYellow: formatter('\x1b[43m', '\x1b[49m'),
		bgBlue: formatter('\x1b[44m', '\x1b[49m'),
		bgMagenta: formatter('\x1b[45m', '\x1b[49m'),
		bgCyan: formatter('\x1b[46m', '\x1b[49m'),
		bgWhite: formatter('\x1b[47m', '\x1b[49m'),
		blackBright: formatter('\x1b[90m', '\x1b[39m'),
		redBright: formatter('\x1b[91m', '\x1b[39m'),
		greenBright: formatter('\x1b[92m', '\x1b[39m'),
		yellowBright: formatter('\x1b[93m', '\x1b[39m'),
		blueBright: formatter('\x1b[94m', '\x1b[39m'),
		magentaBright: formatter('\x1b[95m', '\x1b[39m'),
		cyanBright: formatter('\x1b[96m', '\x1b[39m'),
		whiteBright: formatter('\x1b[97m', '\x1b[39m'),
		bgBlackBright: formatter('\x1b[100m', '\x1b[49m'),
		bgRedBright: formatter('\x1b[101m', '\x1b[49m'),
		bgGreenBright: formatter('\x1b[102m', '\x1b[49m'),
		bgYellowBright: formatter('\x1b[103m', '\x1b[49m'),
		bgBlueBright: formatter('\x1b[104m', '\x1b[49m'),
		bgMagentaBright: formatter('\x1b[105m', '\x1b[49m'),
		bgCyanBright: formatter('\x1b[106m', '\x1b[49m'),
		bgWhiteBright: formatter('\x1b[107m', '\x1b[49m'),
	};
}

/**
 * Default color formatter set for the current process.
 *
 * @remarks
 * Use `color.createColors(false)` when tests need deterministic plain-text
 * output.
 */
export const color: Color = Object.assign(createColors(), { createColors });

/**
 * Named color and style formatter exports from the default `color` object.
 */
export const {
	reset,
	bold,
	dim,
	italic,
	underline,
	inverse,
	hidden,
	strikethrough,
	black,
	red,
	green,
	yellow,
	blue,
	magenta,
	cyan,
	white,
	gray,
	bgBlack,
	bgRed,
	bgGreen,
	bgYellow,
	bgBlue,
	bgMagenta,
	bgCyan,
	bgWhite,
	blackBright,
	redBright,
	greenBright,
	yellowBright,
	blueBright,
	magentaBright,
	cyanBright,
	whiteBright,
	bgBlackBright,
	bgRedBright,
	bgGreenBright,
	bgYellowBright,
	bgBlueBright,
	bgMagentaBright,
	bgCyanBright,
	bgWhiteBright,
} = color;

/**
 * Default export for consumers that prefer importing the formatter object.
 */
export default color;
