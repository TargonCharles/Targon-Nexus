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
});
