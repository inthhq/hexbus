import { describe, expect, it } from "vitest";

import { parseTranscriptFlags } from "../transcript";

describe(parseTranscriptFlags, () => {
  it("parses spaced and equals-form transcript flags", () => {
    expect(
      parseTranscriptFlags(["--log-file", "run.log", "--log-format=jsonl"])
    ).toStrictEqual({
      filePath: "run.log",
      format: "jsonl",
    });
  });

  it("does not consume another flag as a missing transcript value", () => {
    expect(parseTranscriptFlags(["--log-file", "--help"])).toBeNull();
    expect(
      parseTranscriptFlags(["--log-file=run.log", "--log-format", "--help"])
    ).toStrictEqual({
      filePath: "run.log",
      format: "text",
    });
  });
});
