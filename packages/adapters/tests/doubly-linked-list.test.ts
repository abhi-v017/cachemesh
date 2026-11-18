import { describe, it, expect } from 'vitest';
import { DoublyLinkedList, ListNode } from '../src/memory/doubly-linked-list.js';

describe('DoublyLinkedList', () => {
  it('initializes empty with size 0', () => {
    const list = new DoublyLinkedList<number>();
    expect(list.size).toBe(0);
    expect(list.isEmpty()).toBe(true);
    expect(list.popBack()).toBeNull();
  });

  it('correctly pushes nodes to the front and tracks size', () => {
    const list = new DoublyLinkedList<string>();
    const nodeA = new ListNode('a', 'alpha');
    const nodeB = new ListNode('b', 'beta');

    list.pushFront(nodeA);
    expect(list.size).toBe(1);
    expect(list.isEmpty()).toBe(false);

    list.pushFront(nodeB);
    expect(list.size).toBe(2);

    // B was pushed after A, so B is at the front, A is at the back
    const popped = list.popBack();
    expect(popped?.key).toBe('a');
    expect(popped?.value).toBe('alpha');
    expect(list.size).toBe(1);

    const poppedNext = list.popBack();
    expect(poppedNext?.key).toBe('b');
    expect(list.size).toBe(0);
    expect(list.isEmpty()).toBe(true);
  });

  it('moves existing node to front in O(1)', () => {
    const list = new DoublyLinkedList<number>();
    const node1 = new ListNode('1', 1);
    const node2 = new ListNode('2', 2);
    const node3 = new ListNode('3', 3);

    list.pushFront(node1);
    list.pushFront(node2);
    list.pushFront(node3);
    // Order from front to back: 3, 2, 1

    list.moveToFront(node1);
    // Order from front to back: 1, 3, 2

    expect(list.popBack()?.key).toBe('2');
    expect(list.popBack()?.key).toBe('3');
    expect(list.popBack()?.key).toBe('1');
    expect(list.isEmpty()).toBe(true);
  });

  it('removes middle node correctly', () => {
    const list = new DoublyLinkedList<number>();
    const node1 = new ListNode('1', 10);
    const node2 = new ListNode('2', 20);
    const node3 = new ListNode('3', 30);

    list.pushFront(node1);
    list.pushFront(node2);
    list.pushFront(node3);
    // Order: 3, 2, 1

    list.remove(node2);
    expect(list.size).toBe(2);

    expect(list.popBack()?.key).toBe('1');
    expect(list.popBack()?.key).toBe('3');
    expect(list.popBack()).toBeNull();
  });

  it('clears all items cleanly', () => {
    const list = new DoublyLinkedList<number>();
    list.pushFront(new ListNode('1', 1));
    list.pushFront(new ListNode('2', 2));
    list.clear();

    expect(list.size).toBe(0);
    expect(list.isEmpty()).toBe(true);
    expect(list.popBack()).toBeNull();
  });
});
