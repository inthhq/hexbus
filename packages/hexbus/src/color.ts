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
  stdout?: Pick<NodeJS.WriteStream, "isTTY">;
}

/**
 * Default color formatter object plus a factory for creating formatter sets
 * with explicit color support.
 */
export type Color = Colors & { createColors: typeof createColors };

const replaceClose = (
  string: string,
  close: string,
  replace: string,
  startIndex: number
): string => {
  let result = "";
  let cursor = 0;
  let index = startIndex;

  do {
    result += string.slice(cursor, index) + replace;
    cursor = index + close.length;
    index = string.indexOf(close, cursor);
  } while (index !== -1);

  return result + string.slice(cursor);
};

const createFormatter =
  (open: string, close: string, replace = open): ColorFormatter =>
  (input: unknown) => {
    const string = String(input);
    const index = string.indexOf(close, open.length);
    return index === -1
      ? open + string + close
      : open + replaceClose(string, close, replace, index) + close;
  };

const createPlainFormatter = (): ColorFormatter => String;

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
  const forceColor = env.FORCE_COLOR
    ? env.FORCE_COLOR.toLowerCase()
    : undefined;
  const hasNoColor = !!env.NO_COLOR;
  const isCI = !!env.CI;
  const isForceColorDisabled = forceColor === "0" || forceColor === "false";
  const isDisabled =
    hasNoColor || argv.includes("--no-color") || isForceColorDisabled;

  if (isDisabled) {
    return false;
  }

  if (
    (forceColor !== undefined &&
      forceColor !== "0" &&
      forceColor !== "false") ||
    argv.includes("--color")
  ) {
    return true;
  }

  if (platform === "win32") {
    return true;
  }

  return (Boolean(stdout.isTTY) && env.TERM !== "dumb") || isCI;
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
  const formatter = enabled ? createFormatter : createPlainFormatter;

  return {
    bgBlack: formatter("\u001B[40m", "\u001B[49m"),
    bgBlackBright: formatter("\u001B[100m", "\u001B[49m"),
    bgBlue: formatter("\u001B[44m", "\u001B[49m"),
    bgBlueBright: formatter("\u001B[104m", "\u001B[49m"),
    bgCyan: formatter("\u001B[46m", "\u001B[49m"),
    bgCyanBright: formatter("\u001B[106m", "\u001B[49m"),
    bgGreen: formatter("\u001B[42m", "\u001B[49m"),
    bgGreenBright: formatter("\u001B[102m", "\u001B[49m"),
    bgMagenta: formatter("\u001B[45m", "\u001B[49m"),
    bgMagentaBright: formatter("\u001B[105m", "\u001B[49m"),
    bgRed: formatter("\u001B[41m", "\u001B[49m"),
    bgRedBright: formatter("\u001B[101m", "\u001B[49m"),
    bgWhite: formatter("\u001B[47m", "\u001B[49m"),
    bgWhiteBright: formatter("\u001B[107m", "\u001B[49m"),
    bgYellow: formatter("\u001B[43m", "\u001B[49m"),
    bgYellowBright: formatter("\u001B[103m", "\u001B[49m"),
    black: formatter("\u001B[30m", "\u001B[39m"),
    blackBright: formatter("\u001B[90m", "\u001B[39m"),
    blue: formatter("\u001B[34m", "\u001B[39m"),
    blueBright: formatter("\u001B[94m", "\u001B[39m"),
    bold: formatter("\u001B[1m", "\u001B[22m", "\u001B[22m\u001B[1m"),
    cyan: formatter("\u001B[36m", "\u001B[39m"),
    cyanBright: formatter("\u001B[96m", "\u001B[39m"),
    dim: formatter("\u001B[2m", "\u001B[22m", "\u001B[22m\u001B[2m"),
    gray: formatter("\u001B[90m", "\u001B[39m"),
    green: formatter("\u001B[32m", "\u001B[39m"),
    greenBright: formatter("\u001B[92m", "\u001B[39m"),
    hidden: formatter("\u001B[8m", "\u001B[28m"),
    inverse: formatter("\u001B[7m", "\u001B[27m"),
    isColorSupported: enabled,
    italic: formatter("\u001B[3m", "\u001B[23m"),
    magenta: formatter("\u001B[35m", "\u001B[39m"),
    magentaBright: formatter("\u001B[95m", "\u001B[39m"),
    red: formatter("\u001B[31m", "\u001B[39m"),
    redBright: formatter("\u001B[91m", "\u001B[39m"),
    reset: formatter("\u001B[0m", "\u001B[0m"),
    strikethrough: formatter("\u001B[9m", "\u001B[29m"),
    underline: formatter("\u001B[4m", "\u001B[24m"),
    white: formatter("\u001B[37m", "\u001B[39m"),
    whiteBright: formatter("\u001B[97m", "\u001B[39m"),
    yellow: formatter("\u001B[33m", "\u001B[39m"),
    yellowBright: formatter("\u001B[93m", "\u001B[39m"),
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
