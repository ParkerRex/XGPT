import type {
  FetchParameters,
  FetchTransformOptions,
} from "@the-convocation/twitter-scraper";
import { createHash } from "crypto";
import type { UserConfig } from "../config/schema.js";
import { loadConfig } from "../config/manager.js";
import {
  queryIdCacheQueries,
} from "../database/queries.js";
import { loggers } from "../utils/logger.js";
import { QUERY_ID_SNAPSHOT } from "./queryIdSnapshot.js";

const log = loggers.api.child("query-id-cache");

type QueryIdCacheStatus = "active" | "invalid" | "expired";

type QueryIdCacheSource = "discovery" | "snapshot" | "manual";

interface QueryIdResolution {
  queryId: string;
  source: QueryIdCacheSource;
  refreshed: boolean;
}

interface GraphqlRequestDetails {
  url: URL;
  queryId: string;
  operationName: string;
  featureSignature: string;
}

interface CachedEntry {
  id: number;
  operationName: string;
  featureSignature: string;
  queryId: string;
  source: QueryIdCacheSource;
  fetchedAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
  useCount: number;
  status: QueryIdCacheStatus;
  error: string | null;
}

let configPromise: Promise<UserConfig> | null = null;
let configCache: UserConfig | null = null;
let useMemoryOnly = false;
let memoryIdCounter = 1;
const memoryCache = new Map<string, CachedEntry>();

function buildCacheKey(operationName: string, featureSignature: string): string {
  return `${operationName}::${featureSignature}`;
}

async function getConfig(): Promise<UserConfig> {
  if (configCache) return configCache;
  if (!configPromise) {
    configPromise = loadConfig();
  }
  configCache = await configPromise;
  return configCache;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

function normalizeVariableSchema(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array", items: null };
    return { type: "array", items: normalizeVariableSchema(value[0]) };
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const schema: Record<string, unknown> = {};
    for (const key of keys) {
      schema[key] = normalizeVariableSchema(record[key]);
    }
    return schema;
  }
  return typeof value;
}

function buildFeatureSignature(
  features: Record<string, unknown> | undefined,
  fieldToggles: Record<string, unknown> | undefined,
  variables: Record<string, unknown> | undefined,
): string {
  const payload = {
    features: features ?? null,
    fieldToggles: fieldToggles ?? null,
    variables: normalizeVariableSchema(variables ?? null),
  };
  const raw = stableStringify(payload);
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function parseGraphqlRequest(inputUrl: string): GraphqlRequestDetails | null {
  try {
    const url = new URL(inputUrl);
    const match = url.pathname.match(/\/graphql\/([^/]+)\/([^/?]+)/);
    if (!match) return null;

    const queryId = match[1];
    const operationName = match[2];
    const featuresRaw = url.searchParams.get("features");
    const fieldTogglesRaw = url.searchParams.get("fieldToggles");
    const variablesRaw = url.searchParams.get("variables");

    const features = featuresRaw ? (JSON.parse(featuresRaw) as Record<string, unknown>) : undefined;
    const fieldToggles = fieldTogglesRaw
      ? (JSON.parse(fieldTogglesRaw) as Record<string, unknown>)
      : undefined;
    const variables = variablesRaw ? (JSON.parse(variablesRaw) as Record<string, unknown>) : undefined;

    const featureSignature = buildFeatureSignature(features, fieldToggles, variables);

    return {
      url,
      queryId,
      operationName,
      featureSignature,
    };
  } catch {
    return null;
  }
}

function updateUrlQueryId(url: URL, queryId: string): string {
  const pathMatch = url.pathname.match(/\/graphql\/([^/]+)\/([^/?]+)/);
  if (!pathMatch) return url.toString();
  url.pathname = url.pathname.replace(/\/graphql\/[^/]+\//, `/graphql/${queryId}/`);
  return url.toString();
}

async function getCachedEntry(
  operationName: string,
  featureSignature: string,
): Promise<CachedEntry | null> {
  const key = buildCacheKey(operationName, featureSignature);
  if (useMemoryOnly) {
    return memoryCache.get(key) ?? null;
  }
  try {
    const entry = await queryIdCacheQueries.getEntry(operationName, featureSignature);
    return entry ? ({
      ...entry,
      fetchedAt: entry.fetchedAt as Date,
      expiresAt: entry.expiresAt as Date,
      lastUsedAt: entry.lastUsedAt as Date,
      status: entry.status as QueryIdCacheStatus,
      source: entry.source as QueryIdCacheSource,
      error: entry.error ?? null,
    } as CachedEntry) : null;
  } catch (error) {
    useMemoryOnly = true;
    log.warn("query_id_cache.db_unavailable", { error: String(error) });
    return memoryCache.get(key) ?? null;
  }
}

async function upsertCachedEntry(entry: CachedEntry): Promise<CachedEntry> {
  const key = buildCacheKey(entry.operationName, entry.featureSignature);
  if (useMemoryOnly) {
    const existing = memoryCache.get(key);
    const nextEntry: CachedEntry = {
      ...entry,
      id: existing?.id ?? memoryIdCounter++,
      useCount: (existing?.useCount ?? 0) + 1,
    };
    memoryCache.set(key, nextEntry);
    return nextEntry;
  }

  try {
    const created = await queryIdCacheQueries.upsertEntry({
      operationName: entry.operationName,
      featureSignature: entry.featureSignature,
      queryId: entry.queryId,
      source: entry.source,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
      lastUsedAt: entry.lastUsedAt,
      useCount: entry.useCount,
      status: entry.status,
      error: entry.error,
    });

    return {
      ...entry,
      id: created.id,
      useCount: created.useCount,
    };
  } catch (error) {
    useMemoryOnly = true;
    log.warn("query_id_cache.db_unavailable", { error: String(error) });
    const nextEntry: CachedEntry = {
      ...entry,
      id: memoryIdCounter++,
    };
    memoryCache.set(key, nextEntry);
    return nextEntry;
  }
}

async function recordUsage(entry: CachedEntry): Promise<void> {
  const key = buildCacheKey(entry.operationName, entry.featureSignature);
  if (useMemoryOnly) {
    const existing = memoryCache.get(key);
    if (existing) {
      existing.lastUsedAt = new Date();
      existing.useCount += 1;
      memoryCache.set(key, existing);
    }
    return;
  }

  try {
    await queryIdCacheQueries.recordUsage(entry.id);
  } catch (error) {
    useMemoryOnly = true;
    log.warn("query_id_cache.db_unavailable", { error: String(error) });
  }
}

async function markInvalid(
  operationName: string,
  featureSignature: string,
  errorMessage: string,
): Promise<void> {
  const key = buildCacheKey(operationName, featureSignature);
  if (useMemoryOnly) {
    const existing = memoryCache.get(key);
    if (existing) {
      existing.status = "invalid";
      existing.error = errorMessage;
      existing.expiresAt = new Date();
      memoryCache.set(key, existing);
    }
    return;
  }

  try {
    await queryIdCacheQueries.markInvalid(
      operationName,
      featureSignature,
      errorMessage,
    );
  } catch (error) {
    useMemoryOnly = true;
    log.warn("query_id_cache.db_unavailable", { error: String(error) });
  }
}

async function pruneCache(maxEntries: number): Promise<void> {
  if (useMemoryOnly) {
    if (memoryCache.size <= maxEntries) return;
    const entries = [...memoryCache.values()].sort(
      (a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime(),
    );
    const toRemove = entries.length - maxEntries;
    for (let i = 0; i < toRemove; i += 1) {
      const entry = entries[i];
      if (entry) {
        memoryCache.delete(buildCacheKey(entry.operationName, entry.featureSignature));
      }
    }
    return;
  }

  try {
    await queryIdCacheQueries.pruneOldest(maxEntries);
  } catch (error) {
    useMemoryOnly = true;
    log.warn("query_id_cache.db_unavailable", { error: String(error) });
  }
}

async function resolveQueryId(details: GraphqlRequestDetails): Promise<QueryIdResolution> {
  const config = await getConfig();
  if (!config.advanced.cacheEnabled) {
    return { queryId: details.queryId, source: "discovery", refreshed: false };
  }

  const ttlHours = config.advanced.cacheTtlHours ?? 24;
  const maxEntries = config.advanced.queryIdCacheMaxEntries ?? 200;
  const snapshotEnabled = config.advanced.queryIdCacheSnapshotEnabled ?? true;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  const entry = await getCachedEntry(details.operationName, details.featureSignature);

  if (entry && entry.status === "active" && entry.expiresAt.getTime() > now.getTime()) {
    await recordUsage(entry);
    log.debug("query_id_cache.hit", {
      operationName: details.operationName,
      signature: details.featureSignature,
    });
    return { queryId: entry.queryId, source: entry.source, refreshed: false };
  }

  let queryId = details.queryId;
  let source: QueryIdCacheSource = "discovery";
  let refreshed = true;

  if (entry?.status === "invalid" && snapshotEnabled) {
    const snapshotId = QUERY_ID_SNAPSHOT[details.operationName];
    if (snapshotId) {
      queryId = snapshotId;
      source = "snapshot";
    }
  }

  const nextEntry: CachedEntry = {
    id: entry?.id ?? memoryIdCounter,
    operationName: details.operationName,
    featureSignature: details.featureSignature,
    queryId,
    source,
    fetchedAt: now,
    expiresAt,
    lastUsedAt: now,
    useCount: entry?.useCount ?? 1,
    status: "active",
    error: null,
  };

  await upsertCachedEntry(nextEntry);
  await pruneCache(maxEntries);

  log.debug("query_id_cache.refresh", {
    operationName: details.operationName,
    signature: details.featureSignature,
    source,
  });

  return { queryId, source, refreshed };
}

function hasInvalidQueryIdError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const errors = record.errors;
  const errorText = record.error;

  const messages: string[] = [];

  if (Array.isArray(errors)) {
    for (const err of errors) {
      if (err && typeof err === "object") {
        const errRecord = err as Record<string, unknown>;
        if (typeof errRecord.message === "string") {
          messages.push(errRecord.message);
        }
      } else if (typeof err === "string") {
        messages.push(err);
      }
    }
  }

  if (typeof errorText === "string") {
    messages.push(errorText);
  }

  const joined = messages.join(" ").toLowerCase();
  if (!joined) return null;

  const pattern = /(queryid|unknown operation|operation not found|no query results|cannot query field|graphql)/;
  return pattern.test(joined) ? joined : null;
}

async function isQueryIdInvalidResponse(response: Response): Promise<string | null> {
  if (response.status < 400) return null;
  if (!response.url.includes("/graphql/")) return null;

  try {
    const cloned = response.clone();
    const payload = await cloned.json();
    return hasInvalidQueryIdError(payload);
  } catch {
    return null;
  }
}

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

function updateFetchInput(
  input: RequestInfo | URL,
  nextUrl: string,
): RequestInfo | URL {
  if (input instanceof Request) {
    return new Request(nextUrl, input);
  }
  if (input instanceof URL) {
    return new URL(nextUrl);
  }
  return nextUrl;
}

export function createQueryIdCacheTransform(): Partial<FetchTransformOptions> {
  return {
    request: async (...args: FetchParameters): Promise<FetchParameters> => {
      const [input, init] = args;
      const urlString = resolveFetchUrl(input);
      const details = parseGraphqlRequest(urlString);
      if (!details) return args;

      const config = await getConfig();
      if (!config.advanced.cacheEnabled) {
        return args;
      }

      const resolved = await resolveQueryId(details);
      const nextUrl = updateUrlQueryId(new URL(urlString), resolved.queryId);

      if (nextUrl === urlString) return args;
      const nextInput = updateFetchInput(input, nextUrl);
      return [nextInput, init];
    },
    response: async (response: Response): Promise<Response> => {
      const config = await getConfig();
      if (!config.advanced.cacheEnabled) {
        return response;
      }

      if (!response.url.includes("/graphql/")) return response;
      const details = parseGraphqlRequest(response.url);
      if (!details) return response;

      const invalidMessage = await isQueryIdInvalidResponse(response);
      if (!invalidMessage) return response;

      await markInvalid(details.operationName, details.featureSignature, invalidMessage);
      log.warn("query_id_cache.invalidated", {
        operationName: details.operationName,
        signature: details.featureSignature,
      });
      return response;
    },
  };
}

export async function invalidateQueryId(
  operationName: string,
  featureSignature: string,
  reason: string,
): Promise<void> {
  await markInvalid(operationName, featureSignature, reason);
}

export async function clearQueryIdCache(): Promise<void> {
  memoryCache.clear();
  if (useMemoryOnly) return;
  try {
    await queryIdCacheQueries.clearAll();
  } catch (error) {
    useMemoryOnly = true;
    log.warn("query_id_cache.db_unavailable", { error: String(error) });
  }
}
