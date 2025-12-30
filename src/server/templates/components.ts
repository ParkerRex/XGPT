/**
 * Reusable HTML components for XGPT web UI
 */

import { formatNumber } from "../../utils/format.js";

/**
 * Render a card component
 */
export function card(title: string, content: string): string {
  return `
    <div class="card">
      <h2>${title}</h2>
      ${content}
    </div>
  `;
}

/**
 * Render a stat card
 */
export function statCard(value: number | string, label: string): string {
  const displayValue =
    typeof value === "number" ? value.toLocaleString() : value;
  return `
    <div class="card">
      <div class="stat">
        <div class="stat-value">${displayValue}</div>
        <div class="stat-label">${label}</div>
      </div>
    </div>
  `;
}

/**
 * Render a result box (success or error)
 */
export function result(
  content: string,
  type: "success" | "error" | "default" = "default",
): string {
  const className = type === "default" ? "result" : `result ${type}`;
  return `<div class="${className}">${content}</div>`;
}

/**
 * Render a form group with label
 */
export function formGroup(label: string, inputHtml: string): string {
  return `
    <div class="form-group">
      <label>${label}</label>
      ${inputHtml}
    </div>
  `;
}

/**
 * Render a table with headers and rows
 */
export function table(headers: string[], rows: string[][]): string {
  const headerHtml = headers.map((h) => `<th>${h}</th>`).join("");
  const rowsHtml = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("");

  return `
    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

/**
 * Render a tweet item
 */
export function tweetItem(
  user: string,
  text: string,
  similarity?: number,
): string {
  return `
    <div class="tweet">
      <div class="tweet-header">
        <span>@${user}</span>
        ${similarity !== undefined ? `<span class="similarity">${(similarity * 100).toFixed(1)}% match</span>` : ""}
      </div>
      <div class="tweet-text">${text}</div>
    </div>
  `;
}

/**
 * Render a profile item (for discover results)
 */
export function profileItem(profile: {
  username: string;
  name?: string;
  bio?: string;
  followers?: number;
  verified?: boolean;
  location?: string;
}): string {
  return `
    <div class="tweet">
      <div class="tweet-header">
        <span><strong>@${profile.username}</strong>${profile.verified ? " [verified]" : ""}</span>
        <span class="similarity">${formatNumber(profile.followers)} followers</span>
      </div>
      <div class="tweet-text">
        <strong>${profile.name || "N/A"}</strong><br>
        ${profile.bio ? profile.bio.substring(0, 200) + (profile.bio.length > 200 ? "..." : "") : "No bio"}
        ${profile.location ? `<br><span style="color: var(--text-muted);">Location: ${profile.location}</span>` : ""}
      </div>
    </div>
  `;
}

/**
 * Render a user table row
 */
export function userRow(user: {
  username: string;
  displayName?: string;
  bio?: string;
  location?: string;
  followersCount?: number;
  tweetsCount?: number;
  isVerified?: boolean;
}): string {
  return `
    <tr>
      <td>
        <strong>@${user.username}</strong>
        ${user.isVerified ? '<span class="verified-badge">[verified]</span>' : ""}
        ${user.displayName ? `<br><span style="color: var(--text-muted);">${user.displayName}</span>` : ""}
      </td>
      <td class="bio-text" title="${user.bio || ""}">${user.bio || "-"}</td>
      <td>${user.location || "-"}</td>
      <td>${formatNumber(user.followersCount)}</td>
      <td>${formatNumber(user.tweetsCount)}</td>
    </tr>
  `;
}

/**
 * Render job item for taskbar
 */
export function jobItem(job: {
  id: string;
  type: string;
  status: string;
  progress: { current: number; total: number; message: string };
  duration: string;
}): string {
  const pct =
    job.progress.total > 0
      ? Math.round((job.progress.current / job.progress.total) * 100)
      : 0;

  let icon = '<div class="job-spinner"></div>';
  if (job.status === "completed") icon = '<span class="job-done">Done</span>';
  if (job.status === "failed") icon = '<span class="job-failed">Failed</span>';
  if (job.status === "cancelled")
    icon = '<span class="job-cancelled">Cancelled</span>';

  // Cancel button only shown for running jobs
  const cancelButton =
    job.status === "running"
      ? `<button
          class="job-cancel-btn"
          hx-post="/api/jobs/${job.id}/cancel"
          hx-swap="none"
          title="Cancel job"
        >×</button>`
      : "";

  return `
    <div class="job-item">
      ${icon}
      <span><strong>${job.type}</strong></span>
      <span>${job.progress.message}</span>
      ${
        job.progress.total > 0
          ? `
        <div class="job-progress">
          <div class="job-progress-bar" style="width: ${pct}%"></div>
        </div>
        <span>${job.progress.current}/${job.progress.total}</span>
      `
          : ""
      }
      <span style="color: var(--text-muted)">${job.duration}</span>
      ${cancelButton}
    </div>
  `;
}
