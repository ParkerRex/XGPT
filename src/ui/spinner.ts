/**
 * Spinner component for indeterminate progress
 * Used when the total duration or items are unknown
 */

export interface SpinnerOptions {
  text?: string;
  spinner?: string[];
  interval?: number;
  stream?: NodeJS.WriteStream;
}

/**
 * Spinner class for showing indeterminate progress
 */
export class Spinner {
  private options: Required<SpinnerOptions>;
  private frameIndex: number = 0;
  private intervalId?: NodeJS.Timeout;
  private isSpinning: boolean = false;

  // Default spinner frames
  private static readonly defaultFrames = [
    "⠋",
    "⠙",
    "⠹",
    "⠸",
    "⠼",
    "⠴",
    "⠦",
    "⠧",
    "⠇",
    "⠏",
  ];

  // Preset spinners
  static readonly presets = {
    dots: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    line: ["-", "\\", "|", "/"],
    arrow: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
    pulse: ["▉", "▊", "▋", "▌", "▍", "▎", "▏", "▎", "▍", "▌", "▋", "▊", "▉"],
    bounce: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
    box: ["◰", "◳", "◲", "◱"],
    circle: ["◐", "◓", "◑", "◒"],
    star: ["✶", "✸", "✹", "✺", "✹", "✸"],
  };

  constructor(options: SpinnerOptions = {}) {
    this.options = {
      text: options.text || "",
      spinner: options.spinner || Spinner.defaultFrames,
      interval: options.interval || 80,
      stream: options.stream || process.stdout,
    };
  }

  /**
   * Start the spinner
   */
  start(text?: string): void {
    if (this.isSpinning) return;

    if (text) {
      this.options.text = text;
    }

    this.isSpinning = true;
    this.hideCursor();

    this.intervalId = setInterval(() => {
      this.render();
    }, this.options.interval);
  }

  /**
   * Update spinner text
   */
  update(text: string): void {
    this.options.text = text;
    if (this.isSpinning) {
      this.clear();
      this.render();
    }
  }

  /**
   * Stop the spinner with a final message
   */
  stop(finalText?: string, symbol?: string): void {
    if (!this.isSpinning) return;

    this.isSpinning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.clear();

    if (finalText) {
      const prefix = symbol || "[done]";
      this.options.stream.write(`${prefix} ${finalText}\n`);
    }

    this.showCursor();
  }

  /**
   * Stop with success message
   */
  succeed(text?: string): void {
    this.stop(text || this.options.text, "[ok]");
  }

  /**
   * Stop with failure message
   */
  fail(text?: string): void {
    this.stop(text || this.options.text, "[error]");
  }

  /**
   * Stop with warning message
   */
  warn(text?: string): void {
    this.stop(text || this.options.text, "[warn]");
  }

  /**
   * Stop with info message
   */
  info(text?: string): void {
    this.stop(text || this.options.text, "[info]");
  }

  /**
   * Render current frame
   */
  private render(): void {
    const frame = this.options.spinner[this.frameIndex];
    const text = this.options.text ? ` ${this.options.text}` : "";

    this.clear();
    this.options.stream.write(`${frame}${text}`);

    this.frameIndex = (this.frameIndex + 1) % this.options.spinner.length;
  }

  /**
   * Clear current line
   */
  private clear(): void {
    // Use ANSI escape codes for Bun compatibility
    this.options.stream.write("\r\x1b[K");
  }

  /**
   * Hide cursor
   */
  private hideCursor(): void {
    this.options.stream.write("\u001B[?25l");
  }

  /**
   * Show cursor
   */
  private showCursor(): void {
    this.options.stream.write("\u001B[?25h");
  }
}

/**
 * Spinner factory with presets
 */
export function createSpinner(
  text?: string,
  preset: keyof typeof Spinner.presets = "dots",
): Spinner {
  return new Spinner({
    text,
    spinner: Spinner.presets[preset],
  });
}

/**
 * Common spinner configurations
 */
export const SpinnerPresets = {
  loading: (text: string = "Loading") => createSpinner(text, "dots"),
  processing: (text: string = "Processing") => createSpinner(text, "line"),
  thinking: (text: string = "Thinking") => createSpinner(text, "pulse"),
  searching: (text: string = "Searching") => createSpinner(text, "arrow"),
  connecting: (text: string = "Connecting") => createSpinner(text, "bounce"),
  analyzing: (text: string = "Analyzing") => createSpinner(text, "star"),
};

/**
 * Utility function for temporary spinner operations
 */
export async function withSpinner<T>(
  text: string,
  operation: () => Promise<T>,
  options?: {
    successText?: string;
    failText?: string;
    preset?: keyof typeof Spinner.presets;
  },
): Promise<T> {
  const spinner = createSpinner(text, options?.preset);
  spinner.start();

  try {
    const result = await operation();
    spinner.succeed(options?.successText);
    return result;
  } catch (error) {
    spinner.fail(options?.failText || `Failed: ${text}`);
    throw error;
  }
}
