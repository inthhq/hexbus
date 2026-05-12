export type ColorFormatter = (input: unknown) => string;

export interface Colors {
	isColorSupported: boolean;
	reset: ColorFormatter;
	bold: ColorFormatter;
	dim: ColorFormatter;
	italic: ColorFormatter;
	underline: ColorFormatter;
	inverse: ColorFormatter;
	hidden: ColorFormatter;
	strikethrough: ColorFormatter;
	black: ColorFormatter;
	red: ColorFormatter;
	green: ColorFormatter;
	yellow: ColorFormatter;
	blue: ColorFormatter;
	magenta: ColorFormatter;
	cyan: ColorFormatter;
	white: ColorFormatter;
	gray: ColorFormatter;
	bgBlack: ColorFormatter;
	bgRed: ColorFormatter;
	bgGreen: ColorFormatter;
	bgYellow: ColorFormatter;
	bgBlue: ColorFormatter;
	bgMagenta: ColorFormatter;
	bgCyan: ColorFormatter;
	bgWhite: ColorFormatter;
	blackBright: ColorFormatter;
	redBright: ColorFormatter;
	greenBright: ColorFormatter;
	yellowBright: ColorFormatter;
	blueBright: ColorFormatter;
	magentaBright: ColorFormatter;
	cyanBright: ColorFormatter;
	whiteBright: ColorFormatter;
	bgBlackBright: ColorFormatter;
	bgRedBright: ColorFormatter;
	bgGreenBright: ColorFormatter;
	bgYellowBright: ColorFormatter;
	bgBlueBright: ColorFormatter;
	bgMagentaBright: ColorFormatter;
	bgCyanBright: ColorFormatter;
	bgWhiteBright: ColorFormatter;
}

export interface ColorSupportOptions {
	argv?: readonly string[];
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform | string;
	stdout?: Pick<NodeJS.WriteStream, 'isTTY'>;
}

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

export function detectColorSupport(options: ColorSupportOptions = {}): boolean {
	const argv = options.argv ?? process.argv;
	const env = options.env ?? process.env;
	const platform = options.platform ?? process.platform;
	const stdout = options.stdout ?? process.stdout;
	const forceColor = env.FORCE_COLOR
		? env.FORCE_COLOR.toLowerCase()
		: undefined;
	const hasNoColor = !!env.NO_COLOR;
	const isCI = !!env.CI;
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

export const isColorSupported = detectColorSupport();

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

export const color: Color = Object.assign(createColors(), { createColors });

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

export default color;
