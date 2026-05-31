import fs from "node:fs";
import path from "node:path";

/**
 * Output transcript formats supported by Hexbus' process-level capture.
 */
export type TranscriptFormat = "jsonl" | "text";

/**
 * Parsed transcript options from global CLI flags.
 */
export interface TranscriptFlagOptions {
  /** Path where captured output should be written. */
  readonly filePath: string;
  /** Format used for captured output. */
  readonly format: TranscriptFormat;
}

/**
 * Metadata used to seed structured transcript files.
 */
export interface StartTranscriptOptions extends TranscriptFlagOptions {
  /** CLI app name passed to `runCli`. */
  readonly appName: string;
  /** Working directory where the invocation started. */
  readonly cwd: string;
  /** Raw CLI args after executable and script path. */
  readonly rawArgs: readonly string[];
}

/**
 * Active transcript capture handle.
 */
export interface OutputTranscript {
  /** Ends capture and restores process streams. */
  readonly close: (exitCode?: number) => Promise<void>;
  /** Path being written. */
  readonly filePath: string;
  /** Format being written. */
  readonly format: TranscriptFormat;
}

const DEFAULT_TRANSCRIPT_FORMAT: TranscriptFormat = "text";
const ESCAPE_CHARACTER = String.fromCodePoint(27);
const ANSI_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`, "g");
const TEXT_ENCODINGS = new Set<BufferEncoding>([
  "ascii",
  "base64",
  "base64url",
  "hex",
  "latin1",
  "ucs2",
  "utf-8",
  "utf16le",
]);

function isTranscriptFormat(value: string): value is TranscriptFormat {
  return value === "jsonl" || value === "text";
}

function isBufferEncoding(value: unknown): value is BufferEncoding {
  return (
    typeof value === "string" && TEXT_ENCODINGS.has(value as BufferEncoding)
  );
}

function normalizeFormat(value: string | undefined): TranscriptFormat {
  return value !== undefined && isTranscriptFormat(value)
    ? value
    : DEFAULT_TRANSCRIPT_FORMAT;
}

function valueAfterEquals(arg: string, prefix: string): string | undefined {
  return arg.startsWith(prefix) ? arg.slice(prefix.length) : undefined;
}

function chunkToText(
  chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void)
): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  const encoding = isBufferEncoding(encodingOrCallback)
    ? encodingOrCallback
    : "utf-8";
  return Buffer.from(chunk).toString(encoding);
}

function appendJsonLine(
  filePath: string,
  payload: Readonly<Record<string, unknown>>
): void {
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
}

function appendTranscriptOutput(
  filePath: string,
  format: TranscriptFormat,
  stream: "stderr" | "stdout",
  text: string
): void {
  if (text.length === 0) {
    return;
  }
  if (format === "jsonl") {
    appendJsonLine(filePath, {
      stream,
      text: text.replaceAll(ANSI_PATTERN, ""),
      timestamp: new Date().toISOString(),
      type: "output",
    });
    return;
  }
  fs.appendFileSync(filePath, text, "utf-8");
}

/**
 * Parses Hexbus transcript flags without requiring a full command table.
 *
 * @param rawArgs - Raw CLI args after executable and script path.
 * @returns Transcript options when `--log-file` is present.
 */
export function parseTranscriptFlags(
  rawArgs: readonly string[]
): TranscriptFlagOptions | null {
  let filePath: string | undefined;
  let format: string | undefined;

  for (let index = 0; index < rawArgs.length; index++) {
    const arg = rawArgs[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--log-file") {
      filePath = rawArgs[index + 1];
      index++;
      continue;
    }
    if (arg.startsWith("--log-file=")) {
      filePath = valueAfterEquals(arg, "--log-file=");
      continue;
    }
    if (arg === "--log-format") {
      format = rawArgs[index + 1];
      index++;
      continue;
    }
    if (arg.startsWith("--log-format=")) {
      format = valueAfterEquals(arg, "--log-format=");
    }
  }

  return filePath === undefined || filePath.length === 0
    ? null
    : { filePath, format: normalizeFormat(format) };
}

/**
 * Captures process stdout/stderr into a transcript file while preserving normal
 * terminal output.
 *
 * @param options - Transcript destination, format, and invocation metadata.
 * @returns Capture handle that must be closed when the CLI finishes.
 */
export function startOutputTranscript(
  options: StartTranscriptOptions
): OutputTranscript {
  const startedAt = Date.now();
  fs.mkdirSync(path.dirname(options.filePath), { recursive: true });
  fs.writeFileSync(options.filePath, "", "utf-8");

  if (options.format === "jsonl") {
    appendJsonLine(options.filePath, {
      appName: options.appName,
      argv: options.rawArgs,
      cwd: options.cwd,
      format: options.format,
      pid: process.pid,
      timestamp: new Date(startedAt).toISOString(),
      type: "start",
    });
  }

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  const captureStdoutWrite = ((
    ...args: Parameters<typeof process.stdout.write>
  ) => {
    const [chunk, encodingOrCallback] = args;
    appendTranscriptOutput(
      options.filePath,
      options.format,
      "stdout",
      chunkToText(chunk, encodingOrCallback)
    );
    return originalStdoutWrite(...args);
  }) as typeof process.stdout.write;

  const captureStderrWrite = ((
    ...args: Parameters<typeof process.stderr.write>
  ) => {
    const [chunk, encodingOrCallback] = args;
    appendTranscriptOutput(
      options.filePath,
      options.format,
      "stderr",
      chunkToText(chunk, encodingOrCallback)
    );
    return originalStderrWrite(...args);
  }) as typeof process.stderr.write;

  process.stdout.write = captureStdoutWrite;
  process.stderr.write = captureStderrWrite;

  return {
    close(
      exitCode = typeof process.exitCode === "number" ? process.exitCode : 0
    ) {
      process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
      process.stderr.write = originalStderrWrite as typeof process.stderr.write;
      if (options.format === "jsonl") {
        appendJsonLine(options.filePath, {
          durationMs: Date.now() - startedAt,
          exitCode,
          timestamp: new Date().toISOString(),
          type: "end",
        });
      }
      return Promise.resolve();
    },
    filePath: options.filePath,
    format: options.format,
  };
}
