/**
 * Job tracking system for CLI operations
 * Persists jobs to SQLite and tracks status for the web UI
 */

import { jobQueries } from "../database/queries.js";
import type { Job as DbJob } from "../database/schema.js";

export interface Job {
  id: string;
  type: "scrape" | "search" | "embed" | "discover";
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: Date;
  completedAt?: Date;
  progress: {
    current: number;
    total: number;
    message: string;
  };
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

/**
 * Context passed to job execution functions
 * Includes AbortController signal for cancellation support
 */
export interface JobContext {
  jobId: string;
  signal: AbortSignal;
  /** Check if job has been cancelled */
  isCancelled: () => boolean;
  /** Update job progress */
  updateProgress: (
    current: number,
    total: number,
    message: string,
  ) => Promise<void>;
}

// Convert DB job to API job format
function dbJobToJob(dbJob: DbJob): Job {
  return {
    id: dbJob.id,
    type: dbJob.type as Job["type"],
    status: dbJob.status as Job["status"],
    startedAt: dbJob.startedAt,
    completedAt: dbJob.completedAt || undefined,
    progress: {
      current: dbJob.progressCurrent || 0,
      total: dbJob.progressTotal || 0,
      message: dbJob.progressMessage || "",
    },
    metadata: dbJob.metadata || undefined,
    errorMessage: dbJob.errorMessage || undefined,
  };
}

class JobTracker {
  private jobs: Map<string, Job> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private listeners: Set<(jobs: Job[]) => void> = new Set();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the tracker by loading jobs from database
   * Call this on server startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Mark very old running jobs as failed (crash recovery)
      const staleCount = await jobQueries.markStaleJobsFailed(3600000); // 1 hour
      if (staleCount > 0) {
        console.log(`[jobs] Marked ${staleCount} stale jobs as failed`);
      }

      // Clean up old completed jobs
      const cleanedCount = await jobQueries.cleanupOldJobs(86400000); // 24 hours
      if (cleanedCount > 0) {
        console.log(`[jobs] Cleaned up ${cleanedCount} old jobs`);
      }

      // Load recent jobs (running + recently completed)
      const recentJobs = await jobQueries.getRecentJobs(30000);
      for (const dbJob of recentJobs) {
        this.jobs.set(dbJob.id, dbJobToJob(dbJob));
      }

      this.initialized = true;
      console.log(`[jobs] Loaded ${recentJobs.length} jobs from database`);
    } catch (error) {
      // Database might not be initialized yet, that's okay
      console.log(
        "[jobs] Could not load jobs from database (may not be initialized)",
      );
      this.initialized = true;
    }
  }

  async createJob(
    type: Job["type"],
    metadata?: Record<string, unknown>,
  ): Promise<JobContext> {
    await this.initialize();

    const id = `${type}-${Date.now()}`;
    const abortController = new AbortController();
    const job: Job = {
      id,
      type,
      status: "running",
      startedAt: new Date(),
      progress: {
        current: 0,
        total: 0,
        message: `Starting ${type}...`,
      },
      metadata,
    };

    // Persist to database
    try {
      await jobQueries.createJob({
        id,
        type,
        status: "running",
        progressCurrent: 0,
        progressTotal: 0,
        progressMessage: `Starting ${type}...`,
        metadata: metadata || null,
        startedAt: new Date(),
      });
    } catch (error) {
      console.error("[jobs] Failed to persist job to database:", error);
    }

    this.jobs.set(id, job);
    this.abortControllers.set(id, abortController);
    this.notifyListeners();

    // Return JobContext for the caller to use
    return {
      jobId: id,
      signal: abortController.signal,
      isCancelled: () => abortController.signal.aborted,
      updateProgress: (current: number, total: number, message: string) =>
        this.updateProgress(id, current, total, message),
    };
  }

  async updateProgress(
    id: string,
    current: number,
    total: number,
    message: string,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.progress = { current, total, message };

      // Persist to database (debounced updates could be added for performance)
      try {
        await jobQueries.updateProgress(id, current, total, message);
      } catch (error) {
        // Silently fail - in-memory state is primary
      }

      this.notifyListeners();
    }
  }

  async completeJob(
    id: string,
    success: boolean = true,
    errorMessage?: string,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.status = success ? "completed" : "failed";
      job.completedAt = new Date();
      job.errorMessage = errorMessage;

      // Clean up AbortController
      this.abortControllers.delete(id);

      // Persist to database
      try {
        await jobQueries.completeJob(id, success, errorMessage);
      } catch (error) {
        console.error("[jobs] Failed to persist job completion:", error);
      }

      this.notifyListeners();

      // Remove from memory after 30 seconds (DB retains for cleanup)
      setTimeout(() => {
        this.jobs.delete(id);
        this.notifyListeners();
      }, 30000);
    }
  }

  /**
   * Cancel a running job
   * Signals the AbortController and marks the job as cancelled
   */
  async cancelJob(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    const controller = this.abortControllers.get(id);

    if (!job || job.status !== "running") {
      return false;
    }

    // Signal cancellation
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }

    // Update job status
    job.status = "cancelled";
    job.completedAt = new Date();
    job.progress.message = "Cancelled by user";

    // Persist to database
    try {
      await jobQueries.completeJob(id, false, "Cancelled by user");
    } catch (error) {
      console.error("[jobs] Failed to persist job cancellation:", error);
    }

    this.notifyListeners();

    // Remove from memory after 30 seconds
    setTimeout(() => {
      this.jobs.delete(id);
      this.notifyListeners();
    }, 30000);

    return true;
  }

  /**
   * Get a job by ID
   */
  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /**
   * Check if a job is cancelled
   */
  isJobCancelled(id: string): boolean {
    const controller = this.abortControllers.get(id);
    return controller?.signal.aborted ?? false;
  }

  getActiveJobs(): Job[] {
    return Array.from(this.jobs.values()).filter((j) => j.status === "running");
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  subscribe(listener: (jobs: Job[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const jobs = this.getAllJobs();
    this.listeners.forEach((listener) => listener(jobs));
  }

  /**
   * Reload jobs from database (useful after restart detection)
   */
  async reload(): Promise<void> {
    this.jobs.clear();
    this.initialized = false;
    this.initPromise = null;
    await this.initialize();
    this.notifyListeners();
  }
}

// Singleton instance
export const jobTracker = new JobTracker();
