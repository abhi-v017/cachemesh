export interface ParsedMessage {
  raw: string;
  data?: unknown;
  error?: string;
}

/**
 * Protocol parser that handles newline-delimited JSON stream framing.
 *
 * Buffers incoming stream chunks and emits complete, parsed messages.
 * Robust against fragmented TCP packets, merged messages, and malformed JSON.
 */
export class ProtocolParser {
  private buffer = "";

  /**
   * Appends incoming chunk data and returns all complete messages parsed so far.
   */
  public append(chunk: string): ParsedMessage[] {
    this.buffer += chunk;
    const messages: ParsedMessage[] = [];

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      let line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      // Strip optional carriage return \r (handles \r\n from Windows/telnet)
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }

      const trimmed = line.trim();
      if (trimmed.length === 0) {
        // Skip empty lines / blank enters
        continue;
      }

      try {
        const data = JSON.parse(trimmed);
        messages.push({ raw: trimmed, data });
      } catch (err: any) {
        messages.push({
          raw: trimmed,
          error: `Malformed JSON: ${err.message}`,
        });
      }
    }

    return messages;
  }

  /**
   * Returns unparsed residual buffer contents.
   */
  public getBuffer(): string {
    return this.buffer;
  }

  /**
   * Clears the internal residual buffer.
   */
  public reset(): void {
    this.buffer = "";
  }
}
