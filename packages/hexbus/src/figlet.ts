import figlet from "figlet";

/**
 * Bundled Figlet implementation used by Hexbus banner helpers.
 */
export { figlet };

/**
 * Type of the bundled Figlet implementation.
 */
export type Figlet = typeof figlet;

/**
 * Renders text with Hexbus' bundled Figlet dependency.
 *
 * @remarks
 * If Figlet rendering fails, this helper returns the original text so CLI
 * intros can keep rendering without requiring callers to handle banner errors.
 *
 * @param text - Text to render as an ASCII banner.
 * @returns Rendered Figlet text, or `text` when rendering fails.
 */
export async function renderFiglet(text: string): Promise<string> {
  try {
    return (await figlet(text)) ?? text;
  } catch {
    return text;
  }
}
