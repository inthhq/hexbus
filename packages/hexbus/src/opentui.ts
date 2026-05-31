import type {
  BoxRenderable,
  CliRenderer,
  InputRenderable,
  KeyEvent,
  TextRenderable,
} from "@opentui/core";

import { color } from "./color";
import type { PromptChoice } from "./prompts";

export const promptCancel = Symbol("hexbus.promptCancel");

const MAX_HISTORY_LINES = 14;
const MAX_LOG_LINES = 6;
const PROMPT_WIDTH = 72;
const MIN_SELECT_HEIGHT = 4;
const MAX_SELECT_HEIGHT = 14;
const ACTIVE_COLOR = "#d6f36a";
const BACKGROUND_COLOR = "#101112";
const MUTED_COLOR = "#8a8f98";
const TEXT_COLOR = "#f5f7fa";
const BORDER_COLOR = "#3b3f46";
const WARNING_COLOR = "#ffcc66";
const ERROR_COLOR = "#ff6b6b";
const INPUT_ENTER_EVENT = "enter";
const SESSION_CLOSE_DELAY_MS = 650;
const EXIT_PAINT_DELAY_MS = 900;
const ESCAPE_CHARACTER = String.fromCodePoint(27);
const ANSI_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`, "g");

type PromptResult<TValue> = Promise<TValue | typeof promptCancel>;
type LogTone = "error" | "info" | "muted" | "success" | "warning";

interface SessionLine {
  content: string;
  tone: LogTone;
}

interface OpenTuiSession {
  renderer: CliRenderer;
  root: BoxRenderable;
  historyBox: BoxRenderable;
  promptBox: BoxRenderable;
  logBox: BoxRenderable | null;
  closeTimer?: ReturnType<typeof setTimeout>;
}

interface PromptFrame {
  body: BoxRenderable;
  session: OpenTuiSession;
}

type PromptCancelHandler = () => void;

const historyLines: SessionLine[] = [];
const logLines: SessionLine[] = [];
let introLineCount = 0;
let activeSession: OpenTuiSession | null = null;
let sessionPromise: Promise<OpenTuiSession> | null = null;
let activePromptCount = 0;
let activePromptCancel: PromptCancelHandler | null = null;

function loadOpenTuiCore() {
  return import("@opentui/core");
}

function canUseOpenTui(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function getToneColor(tone: LogTone): string {
  switch (tone) {
    case "error": {
      return ERROR_COLOR;
    }
    case "muted": {
      return MUTED_COLOR;
    }
    case "success": {
      return ACTIVE_COLOR;
    }
    case "warning": {
      return WARNING_COLOR;
    }
    default: {
      return TEXT_COLOR;
    }
  }
}

function inferTone(message: string): LogTone {
  if (message.includes(" error ") || message.startsWith("error ")) {
    return "error";
  }

  if (message.includes(" warning ") || message.startsWith("warning ")) {
    return "warning";
  }

  if (message.includes(" success ") || message.startsWith("success ")) {
    return "success";
  }

  if (message.includes(" debug ") || message.startsWith("debug ")) {
    return "muted";
  }

  return "info";
}

function pushBoundedLine(
  lines: SessionLine[],
  line: SessionLine,
  maxLines: number
): void {
  lines.push(line);
  while (lines.length > maxLines) {
    lines.shift();
  }
}

function pushBoundedMessage(
  lines: SessionLine[],
  message: string,
  tone: LogTone,
  maxLines: number
): void {
  const messageLines = message.split("\n");

  for (const line of messageLines) {
    pushBoundedLine(lines, { content: line, tone }, maxLines);
  }
}

function clearChildren(box: BoxRenderable): void {
  for (const child of box.getChildren()) {
    box.remove(child.id);
  }
}

async function addText(
  renderer: CliRenderer,
  box: BoxRenderable,
  content: string,
  tone: LogTone
): Promise<void> {
  const { TextRenderable } = await loadOpenTuiCore();
  box.add(
    new TextRenderable(renderer, {
      bg: BACKGROUND_COLOR,
      content,
      fg: getToneColor(tone),
      selectable: false,
    })
  );
}

async function renderLines(
  renderer: CliRenderer,
  box: BoxRenderable,
  lines: readonly SessionLine[]
): Promise<void> {
  clearChildren(box);

  for (const line of lines) {
    await addText(renderer, box, line.content, line.tone);
  }
}

function scheduleClose(session: OpenTuiSession): void {
  if (activePromptCount > 0) {
    return;
  }

  if (session.closeTimer !== undefined) {
    clearTimeout(session.closeTimer);
  }

  session.closeTimer = setTimeout(() => {
    if (activeSession === session) {
      activeSession = null;
      sessionPromise = null;
      session.renderer.destroy();
    }
  }, SESSION_CLOSE_DELAY_MS);
}

function closeSession(session: OpenTuiSession): void {
  if (session.closeTimer !== undefined) {
    clearTimeout(session.closeTimer);
  }

  if (activeSession === session) {
    activeSession = null;
    sessionPromise = null;
  }

  session.renderer.destroy();
}

function cancelScheduledClose(session: OpenTuiSession): void {
  if (session.closeTimer !== undefined) {
    clearTimeout(session.closeTimer);
    session.closeTimer = undefined;
  }
}

async function renderLogLines(session: OpenTuiSession): Promise<void> {
  if (logLines.length === 0) {
    if (session.logBox !== null) {
      session.root.remove(session.logBox.id);
      session.logBox = null;
    }
    return;
  }

  if (session.logBox === null) {
    const core = await loadOpenTuiCore();
    const frameWidth = Math.min(
      PROMPT_WIDTH,
      Math.max(30, session.renderer.width - 4)
    );
    session.logBox = new core.BoxRenderable(session.renderer, {
      borderColor: BORDER_COLOR,
      borderStyle: "rounded",
      flexDirection: "column",
      gap: 0,
      minHeight: 3,
      padding: 1,
      width: frameWidth,
    });
    session.root.add(session.logBox);
  }

  await renderLines(session.renderer, session.logBox, logLines);
}

async function createSession(): Promise<OpenTuiSession> {
  const core = await loadOpenTuiCore();
  process.stdout.write("\u001B[H\u001B[J");
  const renderer = await core.createCliRenderer({
    clearOnShutdown: false,
    consoleMode: "disabled",
    exitOnCtrlC: false,
    externalOutputMode: "passthrough",
    prependInputHandlers: [
      (sequence) => {
        if (sequence !== "\u0003") {
          return false;
        }

        activePromptCancel?.();
        return true;
      },
    ],
    screenMode: "alternate-screen",
  });
  const frameWidth = Math.min(PROMPT_WIDTH, Math.max(30, renderer.width - 4));
  const root = new core.BoxRenderable(renderer, {
    flexDirection: "column",
    gap: 1,
    paddingLeft: 1,
    paddingTop: 1,
    width: "100%",
  });
  const historyBox = new core.BoxRenderable(renderer, {
    flexDirection: "column",
    gap: 0,
    width: frameWidth,
  });
  const promptBox = new core.BoxRenderable(renderer, {
    flexDirection: "column",
    gap: 1,
    width: frameWidth,
  });

  root.add(historyBox);
  root.add(promptBox);
  renderer.root.add(root);

  const session = { historyBox, logBox: null, promptBox, renderer, root };
  await renderLines(renderer, historyBox, historyLines);
  await renderLogLines(session);
  renderer.requestRender();
  return session;
}

async function getSession(): Promise<OpenTuiSession> {
  if (activeSession !== null) {
    cancelScheduledClose(activeSession);
    return activeSession;
  }

  sessionPromise ??= createSession();
  activeSession = await sessionPromise;
  cancelScheduledClose(activeSession);
  return activeSession;
}

async function refreshSession(
  options: { scheduleClose?: boolean } = {}
): Promise<void> {
  if (!canUseOpenTui()) {
    return;
  }

  const session = await getSession();
  await renderLines(session.renderer, session.historyBox, historyLines);
  await renderLogLines(session);
  session.renderer.requestRender();
  if ((options.scheduleClose ?? true) && activePromptCount === 0) {
    scheduleClose(session);
  }
}

function renderPlainLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

function setContent(renderable: TextRenderable, content: string): void {
  renderable.content = content;
}

function setForeground(renderable: TextRenderable, fg: string): void {
  renderable.fg = fg;
}

function padRow(content: string, width: number): string {
  return content.padEnd(width, " ");
}

function stripAnsi(content: string): string {
  return content.replace(ANSI_PATTERN, "");
}

function fitLine(content: string, width: number): string {
  const plain = stripAnsi(content);

  if (plain.length <= width) {
    return `${content}${" ".repeat(width - plain.length)}`;
  }

  return plain.slice(0, Math.max(0, width - 1));
}

function renderStaticBox(lines: readonly SessionLine[]): string[] {
  if (lines.length === 0) {
    return [];
  }

  const terminalWidth = process.stdout.columns ?? PROMPT_WIDTH + 4;
  const width = Math.min(PROMPT_WIDTH, Math.max(30, terminalWidth - 4));
  const contentWidth = width - 4;
  const output = [
    ` ${color.dim("╭")}${color.dim("─".repeat(width - 2))}${color.dim("╮")}`,
    ` ${color.dim("│")} ${" ".repeat(contentWidth)} ${color.dim("│")}`,
  ];

  for (const line of lines) {
    output.push(
      ` ${color.dim("│")} ${fitLine(line.content, contentWidth)} ${color.dim("│")}`
    );
  }

  output.push(
    ` ${color.dim("│")} ${" ".repeat(contentWidth)} ${color.dim("│")}`,
    ` ${color.dim("╰")}${color.dim("─".repeat(width - 2))}${color.dim("╯")}`
  );
  return output;
}

function renderStaticExitFrame(): void {
  const lines: string[] = [];

  if (historyLines.length > 0) {
    lines.push(
      ...historyLines.slice(-MAX_HISTORY_LINES).map((line) => line.content),
      ""
    );
  }

  lines.push(...renderStaticBox(logLines.slice(-MAX_LOG_LINES)), "");
  process.stdout.write(`\u001B[?25h\u001B[H\u001B[2J${lines.join("\n")}`);
}

async function addPromptTitle(
  renderer: CliRenderer,
  box: BoxRenderable,
  message: string
): Promise<void> {
  await addText(renderer, box, message, "success");
}

async function createPromptFrame(
  message: string,
  height: number
): Promise<PromptFrame> {
  const core = await loadOpenTuiCore();
  const session = await getSession();
  activePromptCount += 1;
  cancelScheduledClose(session);
  const frameWidth = Math.min(
    PROMPT_WIDTH,
    Math.max(30, session.renderer.width - 4)
  );
  clearChildren(session.promptBox);

  const body = new core.BoxRenderable(session.renderer, {
    borderColor: BORDER_COLOR,
    borderStyle: "rounded",
    flexDirection: "column",
    gap: 0,
    height,
    padding: 1,
    width: frameWidth,
  });

  await addPromptTitle(session.renderer, session.promptBox, message);
  session.promptBox.add(body);
  session.renderer.requestRender();
  return { body, session };
}

function isRawCancelKey(key: KeyEvent): boolean {
  return key.raw === "\u0003" || key.sequence === "\u0003";
}

function isCancelKey(key: KeyEvent): boolean {
  return (
    key.name === "escape" ||
    isRawCancelKey(key) ||
    (key.ctrl && key.name === "c")
  );
}

function clampVisibleOptions(count: number): number {
  return Math.min(Math.max(count, MIN_SELECT_HEIGHT), MAX_SELECT_HEIGHT);
}

function completePrompt(frame: PromptFrame): void {
  activePromptCount = Math.max(0, activePromptCount - 1);
  activePromptCancel = null;
  clearChildren(frame.session.promptBox);
  frame.session.renderer.requestRender();
  closeSession(frame.session);
}

export function isOpenTuiCancel(value: unknown): value is typeof promptCancel {
  return value === promptCancel;
}

export async function openTuiSelect<TValue extends string>(
  message: string,
  options: PromptChoice<TValue>[],
  initialValue?: TValue
): PromptResult<TValue> {
  if (!canUseOpenTui()) {
    return promptCancel;
  }

  let activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === initialValue)
  );
  const frame = await createPromptFrame(
    message,
    clampVisibleOptions(options.length) + 2
  );
  const { TextRenderable } = await loadOpenTuiCore();
  const rows = options.map(
    () =>
      new TextRenderable(frame.session.renderer, {
        bg: BACKGROUND_COLOR,
        content: "",
        fg: TEXT_COLOR,
        selectable: false,
      })
  );
  const rowWidth = Math.max(1, frame.body.width - 2);

  return new Promise((resolve) => {
    const renderRows = () => {
      for (const [index, option] of options.entries()) {
        const cursor = index === activeIndex ? ">" : " ";
        const hint = option.hint ? ` - ${option.hint}` : "";
        const row = rows[index];
        if (row === undefined) {
          continue;
        }
        setContent(row, padRow(`${cursor} ${option.label}${hint}`, rowWidth));
        setForeground(row, index === activeIndex ? ACTIVE_COLOR : TEXT_COLOR);
      }
      frame.session.renderer.requestRender();
    };
    let finished = false;
    function finish(value: TValue | typeof promptCancel): void {
      if (finished) {
        return;
      }

      finished = true;
      completePrompt(frame);
      resolve(value);
    }

    const keyHandler = (key: KeyEvent) => {
      if (isCancelKey(key)) {
        finish(promptCancel);
        return;
      }

      if (key.name === "up" || key.name === "k") {
        activeIndex = (activeIndex - 1 + options.length) % options.length;
        renderRows();
        return;
      }

      if (key.name === "down" || key.name === "j") {
        activeIndex = (activeIndex + 1) % options.length;
        renderRows();
        return;
      }

      if (key.name === "return") {
        const selectedOption = options[activeIndex];
        if (selectedOption !== undefined) {
          finish(selectedOption.value);
        }
      }
    };
    activePromptCancel = () => {
      finish(promptCancel);
    };

    for (const row of rows) {
      frame.body.add(row);
    }
    renderRows();

    frame.session.renderer.keyInput.on("keypress", keyHandler);
  });
}

export function openTuiConfirm(
  message: string,
  initialValue = true
): PromptResult<boolean> {
  return openTuiSelect(
    message,
    [
      { label: "Yes", value: "true" },
      { label: "No", value: "false" },
    ],
    initialValue ? "true" : "false"
  ).then((value) => (value === promptCancel ? value : value === "true"));
}

export async function openTuiText(options: {
  defaultValue?: string;
  initialValue?: string;
  message: string;
  placeholder?: string;
  validate?: (value: string | undefined) => Error | string | undefined;
}): PromptResult<string> {
  if (!canUseOpenTui()) {
    return promptCancel;
  }

  const frame = await createPromptFrame(options.message, 4);
  const { InputRenderable, TextRenderable } = await loadOpenTuiCore();
  const input = new InputRenderable(frame.session.renderer, {
    placeholder: options.placeholder,
    value: options.initialValue ?? "",
    width: Math.max(20, frame.body.width - 2),
  }) as InputRenderable;
  const errorText = new TextRenderable(frame.session.renderer, {
    bg: BACKGROUND_COLOR,
    content: "",
    fg: ERROR_COLOR,
    selectable: false,
  });

  return new Promise((resolve) => {
    let finished = false;
    function finish(value: string | typeof promptCancel): void {
      if (finished) {
        return;
      }

      finished = true;
      completePrompt(frame);
      resolve(value);
    }

    const keyHandler = (key: KeyEvent) => {
      if (isCancelKey(key)) {
        finish(promptCancel);
      }
    };

    input.on(INPUT_ENTER_EVENT, (value) => {
      const inputValue = typeof value === "string" ? value : "";
      const submitted =
        inputValue === "" ? (options.defaultValue ?? "") : inputValue;
      const validationError = options.validate?.(submitted);

      if (validationError !== undefined) {
        setContent(
          errorText,
          validationError instanceof Error
            ? validationError.message
            : validationError
        );
        frame.session.renderer.requestRender();
        return;
      }

      finish(submitted);
    });
    activePromptCancel = () => {
      finish(promptCancel);
    };
    frame.session.renderer.keyInput.on("keypress", keyHandler);

    frame.body.add(input);
    frame.body.add(errorText);
    frame.session.renderer.requestRender();
    input.focus();
  });
}

export async function openTuiMultiselect<TValue extends string>(
  message: string,
  options: PromptChoice<TValue>[],
  initialValues: TValue[] = [],
  required = true
): PromptResult<TValue[]> {
  if (!canUseOpenTui()) {
    return promptCancel;
  }

  const frame = await createPromptFrame(
    message,
    clampVisibleOptions(options.length) + 3
  );
  const { TextRenderable } = await loadOpenTuiCore();
  const selected = new Set(initialValues);
  let activeIndex = 0;
  const status = new TextRenderable(frame.session.renderer, {
    bg: BACKGROUND_COLOR,
    content: "Space toggles, Enter submits",
    fg: MUTED_COLOR,
    selectable: false,
  });
  const rows = options.map(
    () =>
      new TextRenderable(frame.session.renderer, {
        bg: BACKGROUND_COLOR,
        content: "",
        fg: TEXT_COLOR,
        selectable: false,
      })
  );
  const rowWidth = Math.max(1, frame.body.width - 2);

  return new Promise((resolve) => {
    const renderRows = () => {
      for (const [index, option] of options.entries()) {
        const marker = selected.has(option.value) ? "[x]" : "[ ]";
        const cursor = index === activeIndex ? ">" : " ";
        const hint = option.hint ? ` - ${option.hint}` : "";
        const row = rows[index];
        if (row === undefined) {
          continue;
        }
        setContent(
          row,
          padRow(`${cursor} ${marker} ${option.label}${hint}`, rowWidth)
        );
        setForeground(row, index === activeIndex ? ACTIVE_COLOR : TEXT_COLOR);
      }
      frame.session.renderer.requestRender();
    };
    let finished = false;
    function finish(value: TValue[] | typeof promptCancel): void {
      if (finished) {
        return;
      }

      finished = true;
      completePrompt(frame);
      resolve(value);
    }

    const keyHandler = (key: KeyEvent) => {
      if (isCancelKey(key)) {
        finish(promptCancel);
        return;
      }

      if (key.name === "up" || key.name === "k") {
        activeIndex = (activeIndex - 1 + options.length) % options.length;
        renderRows();
        return;
      }

      if (key.name === "down" || key.name === "j") {
        activeIndex = (activeIndex + 1) % options.length;
        renderRows();
        return;
      }

      if (key.name === "space") {
        const value = options[activeIndex]?.value;
        if (value === undefined) {
          return;
        }

        if (selected.has(value)) {
          selected.delete(value);
        } else {
          selected.add(value);
        }
        renderRows();
        return;
      }

      if (key.name === "return") {
        if (required && selected.size === 0) {
          setContent(status, "Select at least one option");
          setForeground(status, WARNING_COLOR);
          frame.session.renderer.requestRender();
          return;
        }

        finish([...selected]);
      }
    };
    activePromptCancel = () => {
      finish(promptCancel);
    };

    frame.body.add(status);
    for (const row of rows) {
      frame.body.add(row);
    }
    renderRows();

    frame.session.renderer.keyInput.on("keypress", keyHandler);
  });
}

export function openTuiMessage(message: string): void {
  if (!canUseOpenTui()) {
    renderPlainLine(message);
    return;
  }

  const tone = inferTone(message);
  const targetLines =
    message.includes("\n") || tone === "info" ? historyLines : logLines;
  const maxLines =
    targetLines === historyLines ? MAX_HISTORY_LINES : MAX_LOG_LINES;
  pushBoundedMessage(targetLines, message, tone, maxLines);
  void refreshSession();
}

export async function openTuiIntro(
  banner: string,
  content: string,
  title?: string
): Promise<void> {
  if (!canUseOpenTui()) {
    renderPlainLine(banner);
    const label = title ? `${color.dim("│")} ${color.bold(title)}\n` : "";
    process.stdout.write(`${label}${color.dim("│")} ${content}\n`);
    return;
  }

  if (introLineCount > 0) {
    historyLines.splice(0, introLineCount);
    introLineCount = 0;
  }

  const initialHistoryLength = historyLines.length;
  pushBoundedMessage(historyLines, banner, "muted", MAX_HISTORY_LINES);

  if (title !== undefined) {
    pushBoundedLine(
      historyLines,
      { content: title, tone: "success" },
      MAX_HISTORY_LINES
    );
  }
  pushBoundedLine(historyLines, { content, tone: "info" }, MAX_HISTORY_LINES);
  introLineCount = historyLines.length - initialHistoryLength;
  await refreshSession({ scheduleClose: false });
}

export function openTuiExit(messages: string[], exitCode: number): never {
  if (!canUseOpenTui()) {
    for (const message of messages) {
      const output = `${message}\n`;
      if (inferTone(message) === "error") {
        process.stderr.write(output);
      } else {
        process.stdout.write(output);
      }
    }
    process.exit(exitCode);
  }

  for (const message of messages) {
    const tone = inferTone(message);
    pushBoundedMessage(logLines, message, tone, MAX_LOG_LINES);
  }

  void (async () => {
    const session = activeSession;
    if (session !== null) {
      if (session.closeTimer !== undefined) {
        clearTimeout(session.closeTimer);
      }
      activeSession = null;
      sessionPromise = null;
      session.renderer.destroy();
    }

    renderStaticExitFrame();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, EXIT_PAINT_DELAY_MS);
    });
    process.exit(exitCode);
  })();

  return new Promise(() => {}) as never;
}

export function openTuiNote(content: string, title?: string): void {
  if (!canUseOpenTui()) {
    const label = title ? `${color.dim("│")} ${color.bold(title)}\n` : "";
    process.stdout.write(`${label}${color.dim("│")} ${content}\n`);
    return;
  }

  if (title !== undefined) {
    pushBoundedLine(
      historyLines,
      { content: title, tone: "success" },
      MAX_HISTORY_LINES
    );
  }
  pushBoundedMessage(historyLines, content, "info", MAX_HISTORY_LINES);
  void refreshSession();
}
