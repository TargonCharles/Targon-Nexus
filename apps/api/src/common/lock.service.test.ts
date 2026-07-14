import { Test, TestingModule } from '@nestjs/testing';
import { LockService } from './lock.service';

describe('LockService', () => {
  let service: LockService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LockService],
    }).compile();

    service = module.get(LockService);
  });

  describe('acquire', () => {
    it('acquires a lock successfully', async () => {
      const lock = await service.acquire('test-key');
      expect(lock).not.toBeNull();
      expect(service.activeCount).toBe(1);
    });

    it('fails to acquire already-held lock', async () => {
      await service.acquire('test-key');
      const lock2 = await service.acquire('test-key');
      expect(lock2).toBeNull();
      expect(service.activeCount).toBe(1);
    });

    it('different keys do not conflict', async () => {
      const lock1 = await service.acquire('key-1');
      const lock2 = await service.acquire('key-2');
      expect(lock1).not.toBeNull();
      expect(lock2).not.toBeNull();
      expect(service.activeCount).toBe(2);

      await lock1!.release();
      expect(service.activeCount).toBe(1);
    });

    it('release frees the lock for re-acquisition', async () => {
      const lock = await service.acquire('test-key');
      await lock!.release();
      expect(service.activeCount).toBe(0);

      const lock2 = await service.acquire('test-key');
      expect(lock2).not.toBeNull();
      expect(service.activeCount).toBe(1);
    });
  });

  describe('withLock', () => {
    it('executes callback under lock protection', async () => {
      let executed = false;
      const result = await service.withLock('key', async () => {
        executed = true;
        return 42;
      });

      expect(executed).toBe(true);
      expect(result).toBe(42);
      expect(service.activeCount).toBe(0); // Released after callback
    });

    it('returns null when lock is held', async () => {
      await service.acquire('key');
      const result = await service.withLock('key', async () => 42);
      expect(result).toBeNull();
      expect(service.activeCount).toBe(1);
    });

    it('releases lock even if callback throws', async () => {
      await expect(
        service.withLock('key', async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      // Lock should still be released
      expect(service.activeCount).toBe(0);
    });
  });
});
