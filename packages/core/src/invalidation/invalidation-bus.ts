export interface InvalidationMessage {
  type: 'key' | 'tag' | 'namespace';
  target: string;
  sourceId: string;
  timestamp: number;
}

export interface InvalidationBus {
  publish(message: InvalidationMessage): Promise<void>;
  subscribe(handler: (message: InvalidationMessage) => void): () => void;
  disconnect?(): Promise<void>;
}

/**
 * Local in-memory invalidation bus for single-process coordination.
 */
export class LocalInvalidationBus implements InvalidationBus {
  private readonly subscribers = new Set<(message: InvalidationMessage) => void>();

  public async publish(message: InvalidationMessage): Promise<void> {
    for (const handler of this.subscribers) {
      try {
        handler(message);
      } catch (err) {
        console.error('[CacheMesh] Error in invalidation bus handler:', err);
      }
    }
  }

  public subscribe(handler: (message: InvalidationMessage) => void): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  public async disconnect(): Promise<void> {
    this.subscribers.clear();
  }
}
