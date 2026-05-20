import { createTestContext } from "./context";
import { dispatchCommand, resolveCommandRoute } from "./dispatch";
import type { CliCommand, CliContext, CliLogger, PackageInfo } from "./types";

/**
 * Options for a lightweight command routing test.
 */
export interface RunCliTestOptions<TContext extends CliContext = CliContext> {
  args: string[];
  commands: CliCommand<TContext>[];
  context?: Partial<TContext>;
  packageInfo?: PackageInfo;
}

/**
 * Result of a lightweight command routing test.
 */
export interface RunCliTestResult {
  commandPath: string[];
  exitCode: number;
  stderr: string;
  stdout: string;
  type: string;
}

function createCapturedLogger(stdout: string[], stderr: string[]): CliLogger {
  return {
    debug(message: string) {
      stdout.push(message);
    },
    error(message: string) {
      stderr.push(message);
    },
    failed(message: string, exitCode = 1): never {
      stderr.push(message);
      throw Object.assign(new Error(message), { exitCode });
    },
    info(message: string) {
      stdout.push(message);
    },
    message(message: string) {
      stdout.push(message);
    },
    note(content: string, title?: string) {
      stdout.push([title, content].filter(Boolean).join("\n"));
    },
    outro(message: string) {
      stdout.push(message);
    },
    step(_current: number, _total: number, label: string) {
      stdout.push(label);
    },
    success(message: string) {
      stdout.push(message);
    },
    warn(message: string) {
      stderr.push(message);
    },
  };
}

/**
 * Runs command routing with a captured test context.
 *
 * @remarks
 * This harness avoids process exits and shell spawning. Use spawned e2e tests
 * for complete entrypoint coverage.
 */
export async function runCliTest<TContext extends CliContext = CliContext>(
  options: RunCliTestOptions<TContext>
): Promise<RunCliTestResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const [commandName, ...commandArgs] = options.args;
  const context = createTestContext({
    commandArgs,
    commandName,
    fs: {
      ...createTestContext().fs,
      getPackageInfo: () =>
        options.packageInfo ?? { name: "test", version: "0.0.0" },
    },
    logger: createCapturedLogger(stdout, stderr),
    ...(options.context as Partial<CliContext> | undefined),
  }) as TContext;
  const result = await dispatchCommand(context, options.commands);
  const route = resolveCommandRoute(context, options.commands);

  return {
    commandPath: route?.commandNames ?? [],
    exitCode: result.type === "command_failed" ? 1 : 0,
    stderr: stderr.join("\n"),
    stdout: stdout.join("\n"),
    type: result.type,
  };
}
