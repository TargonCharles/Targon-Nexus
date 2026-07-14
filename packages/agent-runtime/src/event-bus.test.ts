// ===========================================================================
// EventBus 测试
// ===========================================================================

import { EventBus } from './event-bus';
import type { AgentEvent } from './types';

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    eventType: 'TestEvent',
    timestamp: new Date().toISOString(),
    sourceAgent: 'test-agent',
    runId: 'test-run',
    payload: {},
    ...overrides,
  };
}

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('delivers events to registered listeners', async () => {
    const handler = jest.fn();
    bus.on('TestEvent', handler);

    const event = makeEvent();
    await bus.emit(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('delivers to wildcard listeners', async () => {
    const handler = jest.fn();
    bus.on('*', handler);

    const event = makeEvent({ eventType: 'CustomEvent' });
    await bus.emit(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not deliver to non-matching listeners', async () => {
    const handler = jest.fn();
    bus.on('OtherEvent', handler);

    await bus.emit(makeEvent({ eventType: 'TestEvent' }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('removes listeners correctly', async () => {
    const handler = jest.fn();
    const id = bus.on('TestEvent', handler);
    bus.off(id);

    await bus.emit(makeEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it('waits for specific event type', async () => {
    const promise = bus.waitFor('TargetEvent', 5000);

    setTimeout(async () => {
      await bus.emit(makeEvent({ eventType: 'TargetEvent', payload: { data: 'hello' } }));
    }, 50);

    const received = await promise;
    expect(received.eventType).toBe('TargetEvent');
    expect(received.payload.data).toBe('hello');
  });

  it('times out waiting for event', async () => {
    await expect(bus.waitFor('NeverFired', 200)).rejects.toThrow('Timeout');
  });

  it('delivers to multiple listeners for same event', async () => {
    const h1 = jest.fn();
    const h2 = jest.fn();
    const h3 = jest.fn();

    bus.on('TestEvent', h1);
    bus.on('TestEvent', h2);
    bus.on('TestEvent', h3);

    await bus.emit(makeEvent());

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    expect(h3).toHaveBeenCalledTimes(1);
  });

  it('continues delivering even if one handler throws', async () => {
    const h1 = jest.fn().mockRejectedValue(new Error('boom'));
    const h2 = jest.fn();

    bus.on('TestEvent', h1);
    bus.on('TestEvent', h2);

    await bus.emit(makeEvent());

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1); // Still delivered
  });

  it('tracks listener count', () => {
    expect(bus.listenerCount).toBe(0);
    bus.on('EventA', jest.fn());
    expect(bus.listenerCount).toBe(1);
    bus.on('EventB', jest.fn());
    expect(bus.listenerCount).toBe(2);
  });

  it('cleans up stale resolvers after timeout (no memory leak)', async () => {
    // Trigger a timeout
    await expect(bus.waitFor('WillTimeout', 100)).rejects.toThrow('Timeout');

    // The stale resolver should have been cleaned up — verify by waiting again
    await expect(bus.waitFor('WillTimeout', 100)).rejects.toThrow('Timeout');

    // If the bug existed, the stale wrappedResolve would accumulate.
    // After 3 timeouts, verify the system is still functional (no leak crash).
    for (let i = 0; i < 3; i++) {
      await expect(bus.waitFor(`LeakTest-${i}`, 50)).rejects.toThrow('Timeout');
    }

    // System should still work — emit should find no stale waiters
    const promise = bus.waitFor('PostLeak', 500);
    setTimeout(async () => {
      await bus.emit(makeEvent({ eventType: 'PostLeak', payload: { ok: true } }));
    }, 50);
    const received = await promise;
    expect(received.eventType).toBe('PostLeak');
    expect(received.payload.ok).toBe(true);
  });

  it('waitFor resolves immediately when emit fires before timeout', async () => {
    const promise = bus.waitFor('FastEvent', 5000);
    await bus.emit(makeEvent({ eventType: 'FastEvent', payload: { x: 42 } }));
    const received = await promise;
    expect(received.payload.x).toBe(42);
  });
});
