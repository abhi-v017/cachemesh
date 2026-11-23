import { CacheValue } from "../engine/types.js";
import { CacheStats } from "../stats/metrics.js";

export type CommandName = "SET" | "GET" | "DEL" | "EXISTS" | "INFO" | "PING";

export interface BaseCommand {
  command: string;
}

export interface SetCommand extends BaseCommand {
  command: "SET";
  key: string;
  value: CacheValue;
  ttl?: number;
}

export interface GetCommand extends BaseCommand {
  command: "GET";
  key: string;
}

export interface DelCommand extends BaseCommand {
  command: "DEL";
  key: string;
}

export interface ExistsCommand extends BaseCommand {
  command: "EXISTS";
  key: string;
}

export interface InfoCommand extends BaseCommand {
  command: "INFO";
}

export interface PingCommand extends BaseCommand {
  command: "PING";
  message?: string;
}

export type CacheCommand =
  SetCommand | GetCommand | DelCommand | ExistsCommand | InfoCommand | PingCommand;

/**
 * Standardized response envelope returned to clients.
 */
export interface CommandResponse<T = unknown> {
  success: boolean;
  message?: string;
  value?: T;
  exists?: boolean;
  deleted?: boolean;
  stats?: CacheStats;
  error?: string;
}
