/**
 * Job tracking system for CLI operations
 * Tracks active jobs and their status for the web UI
 */

export interface Job {
  id: string;
  type: "scrape" | "search" | "embed" | "discover";
  status: "running" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  progress: {
    current: number;
    total: number;
    message: string;
  };
  metadata?: Record<string, any>;
}

class JobTracker {
  private jobs: Map<string, Job> = new Map();
  private listeners: Set<(jobs: Job[]) => void> = new Set();

  createJob(type: Job["type"], metadata?: Record<string, any>): string {
    const id = `${type}-${Date.now()}`;
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
    this.jobs.set(id, job);
    this.notifyListeners();
    return id;
  }

  updateProgress(
    id: string,
    current: number,
    total: number,
    message: string,
  ): void {
    const job = this.jobs.get(id);
    if (job) {
      job.progress = { current, total, message };
      this.notifyListeners();
    }
  }

  completeJob(id: string, success: boolean = true): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = success ? "completed" : "failed";
      job.completedAt = new Date();
      this.notifyListeners();

      // Remove completed jobs after 30 seconds
      setTimeout(() => {
        this.jobs.delete(id);
        this.notifyListeners();
      }, 30000);
    }
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
}

// Singleton instance
export const jobTracker = new JobTracker();
