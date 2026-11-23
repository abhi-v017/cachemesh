import { CommandResponse } from "./types.js";
import { CacheStats } from "../stats/metrics.js";
import { CacheValue } from "../engine/types.js";

/**
 * Helper factory functions to build consistent responses.
 */
export class Responses {
  public static ok(message = "OK"): CommandResponse {
    return {
      success: true,
      message,
    };
  }

  public static value(val: CacheValue | undefined): CommandResponse<CacheValue | null> {
    if (val === undefined) {
      return {
        success: true,
        value: null,
      };
    }
    return {
      success: true,
      value: val,
    };
  }

  public static exists(found: boolean): CommandResponse {
    return {
      success: true,
      exists: found,
    };
  }

  public static deleted(removed: boolean): CommandResponse {
    return {
      success: true,
      deleted: removed,
      message: removed ? "Key deleted" : "Key not found",
    };
  }

  public static stats(stats: CacheStats): CommandResponse {
    return {
      success: true,
      stats,
    };
  }

  public static pong(message = "PONG"): CommandResponse {
    return {
      success: true,
      message,
    };
  }

  public static error(message: string): CommandResponse {
    return {
      success: false,
      error: message,
    };
  }
}
