/**
 * Node in a doubly-linked list.
 */
export class ListNode<T> {
  public key: string;
  public value: T;
  public prev: ListNode<T> | null = null;
  public next: ListNode<T> | null = null;

  constructor(key: string, value: T) {
    this.key = key;
    this.value = value;
  }
}

/**
 * High-performance generic Doubly-Linked List with dummy head and tail sentinels.
 * All insertion, deletion, and movement operations are strictly O(1).
 */
export class DoublyLinkedList<T> {
  private readonly head: ListNode<T>;
  private readonly tail: ListNode<T>;
  private _size = 0;

  constructor() {
    // Sentinel nodes simplify boundary conditions (no null checks for empty/single-item list)
    this.head = new ListNode<T>('__HEAD_SENTINEL__', null as unknown as T);
    this.tail = new ListNode<T>('__TAIL_SENTINEL__', null as unknown as T);

    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  public get size(): number {
    return this._size;
  }

  public isEmpty(): boolean {
    return this._size === 0;
  }

  /**
   * Inserts a node right after the head sentinel (most recently used position).
   * O(1) complexity.
   */
  public pushFront(node: ListNode<T>): void {
    node.prev = this.head;
    node.next = this.head.next;

    if (this.head.next) {
      this.head.next.prev = node;
    }
    this.head.next = node;
    this._size++;
  }

  /**
   * Removes an existing node from the list.
   * O(1) complexity.
   */
  public remove(node: ListNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }

    node.prev = null;
    node.next = null;
    this._size--;
  }

  /**
   * Moves an existing node to the front (most recently used position).
   * O(1) complexity.
   */
  public moveToFront(node: ListNode<T>): void {
    this.remove(node);
    this.pushFront(node);
  }

  /**
   * Removes and returns the node right before the tail sentinel (least recently used position).
   * Returns null if list is empty.
   * O(1) complexity.
   */
  public popBack(): ListNode<T> | null {
    if (this.isEmpty()) {
      return null;
    }

    const leastRecent = this.tail.prev;
    if (!leastRecent || leastRecent === this.head) {
      return null;
    }

    this.remove(leastRecent);
    return leastRecent;
  }

  /**
   * Clears all nodes from the list.
   */
  public clear(): void {
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this._size = 0;
  }
}
