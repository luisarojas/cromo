import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

export interface JobLogger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(err: unknown, msg?: string, fields?: Record<string, unknown>): void;
}

export interface JobDeps {
  db: Pool;
  redis: Redis;
  log: JobLogger;
}

export type JobHandler = (deps: JobDeps) => Promise<JobResult>;

export interface JobResult {
  /** Number of rows affected — informational, used in logs. */
  affected?: number;
  /** Arbitrary breadcrumbs for the operator — keep short. */
  details?: Record<string, unknown>;
}

export interface JobDefinition {
  name: string;
  cron: string;        // standard 5-field cron expression in UTC unless noted
  flagKey: string;     // feature_flags row name (e.g. 'JOB_EXPIRE_PENDING_TRADES')
  handler: JobHandler;
  /** When true, only registered when running in cloud (Phase B). */
  cloudOnly?: boolean;
}
