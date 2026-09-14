import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { vi } from 'vitest';

// The suite mounts many Tiptap editors in real (non-faked) time; under
// parallel CPU load a poll-turn can slip well past the framework default of
// 1s. Give async helpers a generous ceiling for determinism.
configure({ asyncUtilTimeout: 10000 });

const rect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => rect,
});

Object.defineProperty(Range.prototype, 'getClientRects', {
  configurable: true,
  value: () => ({ item: () => null, length: 0, [Symbol.iterator]: [][Symbol.iterator] }),
});

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverMock,
  });
}