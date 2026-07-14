// Service bootstrap helper — eliminates duplicated graceful-shutdown
// and entry-point boilerplate across all ARP microservices.
//
// Usage:
//   import { runService } from '@arp/shared';
//   runService({ name: 'crawler', main: async () => { ... }, shutdown: async () => { ... } });

import { createLogger, Logger } from './logger';

export interface ServiceConfig {
  /** Human-readable service name (e.g. "crawler", "extractor"). */
  name: string;

  /** Main entry point — called immediately on startup. */
  main: (logger: Logger) => Promise<void>;

  /** Cleanup callback — called on SIGTERM/SIGINT before process exit. */
  shutdown?: (logger: Logger) => Promise<void>;
}

/**
 * Run a microservice with standardized startup, logging, and graceful
 * shutdown. Replaces the repeated ~15-line `main().catch()` + `process.on`
 * pattern duplicated across all 5 services.
 */
export function runService(config: ServiceConfig): void {
  const logger = createLogger(config.name);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    try {
      if (config.shutdown) {
        await config.shutdown(logger);
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error during shutdown');
    }
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Unhandled rejections should not crash the service, but should be logged
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  config
    .main(logger)
    .then(() => {
      logger.info('Service started successfully');
    })
    .catch((err: unknown) => {
      logger.fatal({ err }, 'Service crashed during startup');
      process.exit(1);
    });
}
