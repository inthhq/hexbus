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
  stdout?: Pick<NodeJS.WriteStream, "isTTY">;
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

export const isColorSupported = detectColorSupport();

export function createColors(enabled = isColorSupported): Colors {
  const formatter = enabled ? createFormatter : () => String;

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
