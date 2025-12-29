/**
 * Status display component for showing operation progress
 * Provides real-time status updates without blocking the UI
 */

export interface StatusLineOptions {
  // Display options
  prefix?: string;
  suffix?: string;
  color?: boolean;
  
  // Update behavior
  persistent?: boolean;
  clearOnUpdate?: boolean;
  
  // Styling
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface StatusMetrics {
  // Counts
  total?: number;
  completed?: number;
  failed?: number;
  skipped?: number;
  
  // Performance
  rate?: number;
  avgTime?: number;
  
  // Custom metrics
  [key: string]: any;
}

/**
 * Status line manager for displaying live updates
 */
export class StatusLine {
  private options: StatusLineOptions;
  private metrics: StatusMetrics = {};
  private lastLine: string = '';
  private stream: NodeJS.WriteStream;

  constructor(options: StatusLineOptions = {}) {
    this.options = {
      color: true,
      persistent: false,
      clearOnUpdate: true,
      width: process.stdout.columns || 80,
      align: 'left',
      ...options
    };
    this.stream = process.stdout;
  }

  /**
   * Update status with new metrics
   */
  update(message: string, metrics?: StatusMetrics): void {
    if (metrics) {
      Object.assign(this.metrics, metrics);
    }

    const statusLine = this.formatStatusLine(message);
    
    if (this.options.clearOnUpdate) {
      this.clear();
    }
    
    this.stream.write(statusLine);
    
    if (this.options.persistent) {
      this.stream.write('\n');
    }
    
    this.lastLine = statusLine;
  }

  /**
   * Clear the current status line
   */
  clear(): void {
    // Use ANSI escape codes for Bun compatibility
    this.stream.write('\r\x1b[K');
  }

  /**
   * Finalize with a permanent message
   */
  done(message?: string): void {
    this.clear();
    if (message) {
      this.stream.write(message + '\n');
    }
  }

  /**
   * Format status line with alignment and truncation
   */
  private formatStatusLine(message: string): string {
    let line = message;
    
    // Add prefix/suffix
    if (this.options.prefix) {
      line = this.options.prefix + ' ' + line;
    }
    if (this.options.suffix) {
      line = line + ' ' + this.options.suffix;
    }
    
    // Add metrics
    const metricsStr = this.formatMetrics();
    if (metricsStr) {
      line = line + ' | ' + metricsStr;
    }
    
    // Truncate if too long
    if (line.length > this.options.width!) {
      line = line.substring(0, this.options.width! - 3) + '...';
    }
    
    // Apply alignment
    if (this.options.align === 'center') {
      const padding = Math.floor((this.options.width! - line.length) / 2);
      line = ' '.repeat(Math.max(0, padding)) + line;
    } else if (this.options.align === 'right') {
      const padding = this.options.width! - line.length;
      line = ' '.repeat(Math.max(0, padding)) + line;
    }
    
    return line;
  }

  /**
   * Format metrics for display
   */
  private formatMetrics(): string {
    const parts: string[] = [];
    
    if (this.metrics.completed !== undefined && this.metrics.total !== undefined) {
      const percentage = Math.round((this.metrics.completed / this.metrics.total) * 100);
      parts.push(`${this.metrics.completed}/${this.metrics.total} (${percentage}%)`);
    }
    
    if (this.metrics.rate !== undefined) {
      parts.push(`${this.metrics.rate.toFixed(1)}/s`);
    }
    
    if (this.metrics.failed !== undefined && this.metrics.failed > 0) {
      parts.push(`[error] ${this.metrics.failed}`);
    }
    
    if (this.metrics.skipped !== undefined && this.metrics.skipped > 0) {
      parts.push(`⏭️  ${this.metrics.skipped}`);
    }
    
    return parts.join(' | ');
  }
}

/**
 * Multi-line status display for complex operations
 */
export class StatusDisplay {
  private lines: Map<string, StatusLine> = new Map();
  private order: string[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Add or update a status line
   */
  updateLine(id: string, message: string, metrics?: StatusMetrics): void {
    if (!this.lines.has(id)) {
      this.lines.set(id, new StatusLine({ persistent: true }));
      this.order.push(id);
    }
    
    const line = this.lines.get(id)!;
    line.update(message, metrics);
  }

  /**
   * Remove a status line
   */
  removeLine(id: string): void {
    if (this.lines.has(id)) {
      this.lines.delete(id);
      this.order = this.order.filter(lineId => lineId !== id);
    }
  }

  /**
   * Clear all status lines
   */
  clear(): void {
    // Use ANSI escape codes for Bun compatibility
    const numLines = this.lines.size;
    for (let i = 0; i < numLines; i++) {
      process.stdout.write('\x1b[1A'); // Move up one line
      process.stdout.write('\r\x1b[K'); // Clear line
    }
  }

  /**
   * Display summary
   */
  summary(): void {
    const elapsed = Date.now() - this.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    console.log('\n[stats] Operation Summary');
    console.log('─'.repeat(40));
    console.log(`⏱️  Total time: ${minutes}m ${seconds}s`);
    
    // Add any accumulated metrics
    this.lines.forEach((line, id) => {
      console.log(`   • ${id}: Complete`);
    });
  }
}

/**
 * Progress status presets
 */
export const StatusPresets = {
  scraping: (processed: number, collected: number, filtered: number): StatusMetrics => ({
    total: processed,
    completed: collected,
    skipped: filtered,
    rate: collected > 0 ? collected / ((Date.now() - Date.now()) / 1000) : 0
  }),
  
  embedding: (current: number, total: number, batchNum: number, totalBatches: number): StatusMetrics => ({
    total,
    completed: current,
    rate: current / ((Date.now() - Date.now()) / 1000),
    batchNumber: batchNum,
    totalBatches
  }),
  
  database: (inserted: number, failed: number, duplicates: number): StatusMetrics => ({
    completed: inserted,
    failed,
    skipped: duplicates
  })
};

/**
 * Utility for temporary status operations
 */
export async function withStatus<T>(
  message: string,
  operation: (status: StatusLine) => Promise<T>
): Promise<T> {
  const status = new StatusLine();
  
  try {
    status.update(message);
    const result = await operation(status);
    status.done();
    return result;
  } catch (error) {
    status.done();
    throw error;
  }
}