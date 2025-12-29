/**
 * Progress indicator components for XGPT CLI
 * Provides consistent progress bars, spinners, and status messages
 */

import * as cliProgress from 'cli-progress';
import { performance } from 'perf_hooks';

export interface ProgressOptions {
  // Display options
  title?: string;
  showPercentage?: boolean;
  showETA?: boolean;
  showValue?: boolean;
  showSpeed?: boolean;
  
  // Styling options
  barSize?: number;
  clearOnComplete?: boolean;
  hideCursor?: boolean;
  
  // Custom format
  format?: string;
  
  // Multi-step progress
  steps?: string[];
  currentStep?: number;
}

export interface ProgressContext {
  // Timing
  startTime: number;
  elapsed: number;
  
  // Counts
  processed: number;
  errors: number;
  skipped: number;
  
  // Rate limiting
  delays: number;
  totalDelayTime: number;
  
  // Custom metadata
  metadata?: Record<string, any>;
}

/**
 * Base progress indicator class
 */
export abstract class ProgressIndicator {
  protected options: ProgressOptions;
  protected context: ProgressContext;
  protected startTime: number;

  constructor(options: ProgressOptions = {}) {
    this.options = {
      showPercentage: true,
      showETA: true,
      showValue: true,
      showSpeed: false,
      barSize: 40,
      clearOnComplete: false,
      hideCursor: true,
      ...options
    };
    
    this.startTime = performance.now();
    this.context = {
      startTime: this.startTime,
      elapsed: 0,
      processed: 0,
      errors: 0,
      skipped: 0,
      delays: 0,
      totalDelayTime: 0
    };
  }

  abstract start(total: number): void;
  abstract update(current: number, context?: Partial<ProgressContext>): void;
  abstract stop(): void;
  abstract fail(message?: string): void;
  
  /**
   * Calculate speed (items per second)
   */
  protected calculateSpeed(): number {
    const elapsed = (performance.now() - this.startTime) / 1000;
    return elapsed > 0 ? this.context.processed / elapsed : 0;
  }
  
  /**
   * Format time duration
   */
  protected formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

/**
 * Single progress bar for simple operations
 */
export class SingleProgressBar extends ProgressIndicator {
  private bar: cliProgress.SingleBar;
  private total: number = 0;

  constructor(options: ProgressOptions = {}) {
    super(options);
    
    // Build format string based on options
    const formatParts: string[] = [];
    
    if (this.options.title) {
      formatParts.push(this.options.title);
    }
    
    formatParts.push('|{bar}|');
    
    if (this.options.showPercentage) {
      formatParts.push('{percentage}%');
    }
    
    if (this.options.showValue) {
      formatParts.push('{value}/{total}');
    }
    
    if (this.options.showSpeed) {
      formatParts.push('{speed} items/s');
    }
    
    if (this.options.showETA) {
      formatParts.push('ETA: {eta}s');
    }
    
    const defaultFormat = formatParts.join(' | ');
    
    this.bar = new cliProgress.SingleBar({
      format: this.options.format || defaultFormat,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: this.options.hideCursor,
      clearOnComplete: this.options.clearOnComplete,
      barsize: this.options.barSize
    });
  }

  start(total: number): void {
    this.total = total;
    this.bar.start(total, 0, {
      speed: 0,
      ...this.context
    });
  }

  update(current: number, context?: Partial<ProgressContext>): void {
    if (context) {
      Object.assign(this.context, context);
    }
    
    this.context.elapsed = performance.now() - this.startTime;
    
    this.bar.update(current, {
      speed: this.calculateSpeed().toFixed(1),
      ...this.context
    });
  }

  stop(): void {
    this.bar.stop();
  }

  fail(message?: string): void {
    this.bar.stop();
    if (message) {
      console.error(`\n[error] ${message}`);
    }
  }
}

/**
 * Multi-step progress bar for complex operations
 */
export class MultiStepProgress extends ProgressIndicator {
  private bars: Map<string, cliProgress.SingleBar> = new Map();
  private multiBar: cliProgress.MultiBar;
  private currentStepIndex: number = 0;

  constructor(options: ProgressOptions = {}) {
    super(options);
    
    this.multiBar = new cliProgress.MultiBar({
      clearOnComplete: this.options.clearOnComplete,
      hideCursor: this.options.hideCursor,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      format: ' {step} |{bar}| {percentage}% | {value}/{total} | {status}'
    });
  }

  start(total: number): void {
    // Initialize bars for each step
    if (this.options.steps) {
      this.options.steps.forEach((step, index) => {
        const bar = this.multiBar.create(total, 0, {
          step: `${index + 1}. ${step}`,
          status: index === 0 ? 'In Progress' : 'Pending'
        });
        this.bars.set(step, bar);
      });
    }
  }

  update(current: number, context?: Partial<ProgressContext> & { step?: string }): void {
    if (context) {
      Object.assign(this.context, context);
    }
    
    // Update specific step if provided
    if (context?.step && this.bars.has(context.step)) {
      const bar = this.bars.get(context.step)!;
      bar.update(current, {
        status: current >= bar.getTotal() ? 'Completed ✓' : 'In Progress'
      });
    }
  }

  /**
   * Move to next step
   */
  nextStep(): void {
    if (this.options.steps && this.currentStepIndex < this.options.steps.length - 1) {
      // Mark current step as complete
      const currentStep = this.options.steps[this.currentStepIndex];
      const currentBar = this.bars.get(currentStep!);
      if (currentBar) {
        currentBar.update(100, { status: 'Completed ✓' });
      }
      
      // Move to next step
      this.currentStepIndex++;
      const nextStep = this.options.steps[this.currentStepIndex];
      const nextBar = this.bars.get(nextStep!);
      if (nextBar) {
        nextBar.update(0, { status: 'In Progress' });
      }
    }
  }

  stop(): void {
    this.multiBar.stop();
  }

  fail(message?: string): void {
    // Mark current step as failed
    if (this.options.steps) {
      const currentStep = this.options.steps[this.currentStepIndex];
      const currentBar = this.bars.get(currentStep!);
      if (currentBar) {
        currentBar.update(0, { status: 'Failed ✗' });
      }
    }
    
    this.multiBar.stop();
    if (message) {
      console.error(`\n[error] ${message}`);
    }
  }
}

/**
 * Factory function to create appropriate progress indicator
 */
export function createProgressBar(options: ProgressOptions & { type?: 'single' | 'multi' } = {}): ProgressIndicator {
  const { type = 'single', ...progressOptions } = options;
  
  if (type === 'multi' && progressOptions.steps) {
    return new MultiStepProgress(progressOptions);
  }
  
  return new SingleProgressBar(progressOptions);
}

/**
 * Progress bar presets for common operations
 */
export const ProgressPresets = {
  scraping: (username: string): ProgressOptions => ({
    title: `[scrape] Scraping @${username}`,
    showPercentage: true,
    showETA: true,
    showValue: true,
    format: '[scrape] Scraping |{bar}| {percentage}% | {value}/{total} tweets | Processed: {processed} | Delays: {delays} | ETA: {eta}s'
  }),
  
  embedding: (model: string): ProgressOptions => ({
    title: `[embed] Generating embeddings (${model})`,
    showPercentage: true,
    showETA: true,
    showValue: true,
    format: '[embed] Embedding |{bar}| {percentage}% | {value}/{total} | Batch: {batchNumber}/{totalBatches} | ETA: {eta}s'
  }),
  
  database: (operation: string): ProgressOptions => ({
    title: `[save] ${operation}`,
    showPercentage: true,
    showValue: true,
    format: '[save] {title} |{bar}| {percentage}% | {value}/{total} records'
  }),
  
  migration: (): ProgressOptions => ({
    title: '[sync] Migrating data',
    showPercentage: true,
    showValue: true,
    steps: ['Reading JSON files', 'Validating data', 'Inserting records', 'Verifying integrity']
  })
};