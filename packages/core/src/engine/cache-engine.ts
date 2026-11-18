import type {
  CacheAdapter,
  SetOptions,
  GetOrSetOptions,
  DeleteOptions,
  AdapterStats,
  CacheEventMap,
  CacheEventName,
} from '@cachemesh/shared';
import {
  formatKey,
  validateKey,
  remainingTtlSec,
} from '@cachemesh/shared';
import { Singleflight } from '../coalescing/singleflight.js';
import { TypedEventEmitter } from '../events/event-emitter.js';
import {
  LocalInvalidationBus,
  type InvalidationBus,
} from '../invalidation/invalidation-bus.js';

export interface LayerConfig {
  name: string;
  adapter: CacheAdapter;
  /** Higher priority layers are checked first. Layer 0 is L1, Layer 1 is L2, etc. */
  priority?: number;
}

export interface CacheEngineConfig {
  layers: LayerConfig[];
  /** Global namespace prefix for keys (e.g. 'myapp:production') */
  namespace?: string;
  /** Default TTL in seconds for all entries unless overridden */
  defaultTTL?: number;
  /** Custom invalidation bus for multi-instance invalidation sync */
  invalidationBus?: InvalidationBus;
  /** Unique instance identifier */
  instanceId?: string;
}

export interface EngineStats {
  layers: Record<string, AdapterStats>;
  inFlightRequests: number;
}

/**
 * CacheEngine is the core multi-layer orchestrator.
 * It manages layer fallback, read backfill, write propagation, singleflight request coalescing,
 * and operational telemetry.
 */
export class CacheEngine {
  private readonly layers: LayerConfig[];
  private readonly namespace?: string;
  private readonly defaultTTL?: number;
  private readonly singleflight = new Singleflight();
  private readonly events = new TypedEventEmitter();
  private readonly invalidationBus: InvalidationBus;
  public readonly instanceId: string;

  constructor(config: CacheEngineConfig) {
    if (!config.layers || config.layers.length === 0) {
      throw new Error('CacheEngine requires at least one cache layer');
    }

    // Sort layers by priority descending (or preserve array order)
    this.layers = [...config.layers].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.namespace = config.namespace;
    this.defaultTTL = config.defaultTTL;
    this.instanceId = config.instanceId ?? `inst-${Math.random().toString(36).substring(2, 9)}`;
    this.invalidationBus = config.invalidationBus ?? new LocalInvalidationBus();

    // Listen to incoming invalidations
    this.invalidationBus.subscribe((msg) => {
      // Don't invalidate ourselves if we were the origin of the invalidation
      if (msg.sourceId === this.instanceId) {
        return;
      }

      if (msg.type === 'key') {
        // Drop key from L1 (first layer)
        const l1 = this.layers[0];
        if (l1) {
          l1.adapter.delete(msg.target).catch((err) => {
            this.events.emit('error', { error: err, layer: l1.name, key: msg.target });
          });
        }
      } else if (msg.type === 'tag') {
        const l1 = this.layers[0];
        if (l1) {
          l1.adapter.deleteByTag(msg.target).catch((err) => {
            this.events.emit('error', { error: err, layer: l1.name });
          });
        }
      }
    });
  }

  /**
   * Reads an entry from the multi-level cache.
   * If a hit occurs in a lower layer (e.g. L2 Redis), it automatically backfills
   * all higher layers (e.g. L1 Memory) with the remaining TTL.
   */
  public async get<T>(key: string): Promise<T | null> {
    const formattedKey = this.resolveKey(key);
    const start = performance.now();

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i]!;
      try {
        const entry = await layer.adapter.get<T>(formattedKey);
        if (entry !== null) {
          const latencyMs = Math.round(performance.now() - start);
          this.events.emit('hit', { key, layer: layer.name, latencyMs });

          // Backfill higher layers (e.g., if found in L2, backfill L1)
          if (i > 0) {
            const remainingTtl = remainingTtlSec(entry.expiresAt);
            for (let higherIdx = 0; higherIdx < i; higherIdx++) {
              const higherLayer = this.layers[higherIdx]!;
              higherLayer.adapter.set(formattedKey, entry.value, {
                ttl: remainingTtl ?? undefined,
                tags: entry.tags,
              }).catch((err) => {
                this.events.emit('error', { error: err, layer: higherLayer.name, key });
              });
            }
          }

          return entry.value;
        }
      } catch (err) {
        this.events.emit('error', { error: err as Error, layer: layer.name, key });
        // Failover: continue trying subsequent layers
      }
    }

    const latencyMs = Math.round(performance.now() - start);
    this.events.emit('miss', { key, latencyMs });
    return null;
  }

  /**
   * Writes a value across all configured cache layers (Write-Through).
   */
  public async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    const formattedKey = this.resolveKey(key);
    const start = performance.now();
    const effectiveTtl = options?.ttl ?? this.defaultTTL;

    const writePromises = this.layers.map(async (layer) => {
      try {
        await layer.adapter.set(formattedKey, value, {
          ...options,
          ttl: effectiveTtl,
        });
        const latencyMs = Math.round(performance.now() - start);
        this.events.emit('set', {
          key,
          layer: layer.name,
          ttl: effectiveTtl,
          latencyMs,
        });
      } catch (err) {
        this.events.emit('error', { error: err as Error, layer: layer.name, key });
        throw err;
      }
    });

    await Promise.all(writePromises);
  }

  /**
   * Atomically fetches from cache, or executes the factory on miss with Singleflight protection.
   */
  public async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: GetOrSetOptions
  ): Promise<T> {
    const existing = await this.get<T>(key);
    if (existing !== null) {
      return existing;
    }

    const formattedKey = this.resolveKey(key);

    // Request Coalescing via Singleflight
    return this.singleflight.execute(
      formattedKey,
      async () => {
        // Double-check: another concurrent execution might have just populated the cache
        const doubleCheck = await this.get<T>(key);
        if (doubleCheck !== null) {
          return doubleCheck;
        }

        const freshValue = await factory();
        await this.set(key, freshValue, options);
        return freshValue;
      },
      options?.timeoutMs
    );
  }

  /**
   * Deletes a key across all cache layers.
   */
  public async delete(key: string, options?: DeleteOptions): Promise<boolean> {
    const formattedKey = this.resolveKey(key);
    let anyDeleted = false;

    for (const layer of this.layers) {
      try {
        const deleted = await layer.adapter.delete(formattedKey);
        if (deleted) {
          anyDeleted = true;
          this.events.emit('delete', { key, layer: layer.name });
        }
      } catch (err) {
        this.events.emit('error', { error: err as Error, layer: layer.name, key });
      }
    }

    // Broadcast distributed invalidation if configured
    if (options?.broadcast !== false) {
      await this.invalidationBus.publish({
        type: 'key',
        target: formattedKey,
        sourceId: this.instanceId,
        timestamp: Date.now(),
      });
    }

    return anyDeleted;
  }

  /**
   * Checks whether a key exists in any cache layer.
   */
  public async has(key: string): Promise<boolean> {
    const formattedKey = this.resolveKey(key);
    for (const layer of this.layers) {
      try {
        if (await layer.adapter.has(formattedKey)) {
          return true;
        }
      } catch (err) {
        this.events.emit('error', { error: err as Error, layer: layer.name, key });
      }
    }
    return false;
  }

  /**
   * Invalidates all cache entries carrying the given tag across all capable layers.
   */
  public async deleteByTag(tag: string): Promise<number> {
    let totalDeleted = 0;

    for (const layer of this.layers) {
      try {
        if (layer.adapter.capabilities.hasTagIndexing) {
          const count = await layer.adapter.deleteByTag(tag);
          totalDeleted += count;
        }
      } catch (err) {
        this.events.emit('error', { error: err as Error, layer: layer.name });
      }
    }

    await this.invalidationBus.publish({
      type: 'tag',
      target: tag,
      sourceId: this.instanceId,
      timestamp: Date.now(),
    });

    return totalDeleted;
  }

  /**
   * Clears all entries from the cache (or scoped to a namespace).
   */
  public async clear(namespace?: string): Promise<void> {
    const targetNamespace = namespace ?? this.namespace;

    for (const layer of this.layers) {
      try {
        await layer.adapter.clear(targetNamespace);
      } catch (err) {
        this.events.emit('error', { error: err as Error, layer: layer.name });
      }
    }

    this.events.emit('clear', { namespace: targetNamespace });
  }

  /**
   * Gathers operational metrics and sizes across all active layers.
   */
  public async getStats(): Promise<EngineStats> {
    const layerStats: Record<string, AdapterStats> = {};

    for (const layer of this.layers) {
      if (layer.adapter.getStats) {
        layerStats[layer.name] = await layer.adapter.getStats();
      } else {
        layerStats[layer.name] = { size: (await layer.adapter.getSize?.()) ?? 0 };
      }
    }

    return {
      layers: layerStats,
      inFlightRequests: this.singleflight.activeCount,
    };
  }

  /**
   * Subscribes to engine events.
   */
  public on<K extends CacheEventName>(event: K, handler: (payload: CacheEventMap[K]) => void): () => void {
    return this.events.on(event, handler);
  }

  public off<K extends CacheEventName>(event: K, handler: (payload: CacheEventMap[K]) => void): void {
    this.events.off(event, handler);
  }

  /**
   * Disconnects all layers and tears down timers and connections.
   */
  public async disconnect(): Promise<void> {
    this.events.removeAllListeners();
    for (const layer of this.layers) {
      if (layer.adapter.disconnect) {
        await layer.adapter.disconnect();
      }
    }
    if (this.invalidationBus.disconnect) {
      await this.invalidationBus.disconnect();
    }
  }

  private resolveKey(key: string): string {
    validateKey(key);
    return formatKey(this.namespace, key);
  }
}
