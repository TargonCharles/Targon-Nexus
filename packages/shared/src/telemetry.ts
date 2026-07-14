// OpenTelemetry instrumentation — tracing, metrics, and structured logging
// for the Targon Nexus. All OTel imports are dynamic (require / await import)
// so the shared package stays zero-dependency. The calling service must
// install @opentelemetry/* packages to enable tracing.
//
// Env vars:
//   OTEL_ENABLED      – "true" to enable (default: false)
//   OTEL_EXPORTER     – "otlp" | "console" (default: "console")
//   OTEL_ENDPOINT     – OTLP collector endpoint (default: http://localhost:4318)
//   OTEL_SERVICE_NAME – Service name (default: "arp-<auto>")

import type { Logger } from './logger';

export interface TelemetryConfig {
  enabled: boolean;
  exporter: 'otlp' | 'console';
  endpoint: string;
  serviceName: string;
}

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attrs?: Record<string, string | number>): void;
  ok(): void;
  error(err: unknown): void;
  end(): void;
}

const noopSpan: Span = {
  setAttribute: () => {},
  addEvent: () => {},
  ok: () => {},
  error: () => {},
  end: () => {},
};

/**
 * Initialize OpenTelemetry SDK. Call once at startup.
 */
export async function initTelemetry(serviceName: string): Promise<TelemetryConfig> {
  const config: TelemetryConfig = {
    enabled: process.env.OTEL_ENABLED === 'true',
    exporter: (process.env.OTEL_EXPORTER as 'otlp' | 'console') ?? 'console',
    endpoint: process.env.OTEL_ENDPOINT ?? 'http://localhost:4318/v1/traces',
    serviceName: process.env.OTEL_SERVICE_NAME ?? `arp-${serviceName}`,
  };

  if (!config.enabled) return config;

  try {
    // All OTel packages are optional — dynamic require avoids build-time deps
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const otel: any = {
      NodeSDK: require('@opentelemetry/sdk-node').NodeSDK,
      OTLPTraceExporter: require('@opentelemetry/exporter-trace-otlp-http').OTLPTraceExporter,
      ConsoleSpanExporter: require('@opentelemetry/sdk-trace-node').ConsoleSpanExporter,
      Resource: require('@opentelemetry/resources').Resource,
      ATTR_SERVICE_NAME: require('@opentelemetry/semantic-conventions').ATTR_SERVICE_NAME,
      ATTR_SERVICE_VERSION: require('@opentelemetry/semantic-conventions').ATTR_SERVICE_VERSION,
      BatchSpanProcessor: require('@opentelemetry/sdk-trace-base').BatchSpanProcessor,
      SimpleSpanProcessor: require('@opentelemetry/sdk-trace-base').SimpleSpanProcessor,
      getNodeAutoInstrumentations: require('@opentelemetry/auto-instrumentations-node').getNodeAutoInstrumentations,
    };

    const exporter =
      config.exporter === 'otlp'
        ? new otel.OTLPTraceExporter({ url: config.endpoint })
        : new otel.ConsoleSpanExporter();

    const processor =
      config.exporter === 'otlp'
        ? new otel.BatchSpanProcessor(exporter)
        : new otel.SimpleSpanProcessor(exporter);

    const sdk = new otel.NodeSDK({
      resource: new otel.Resource({
        [otel.ATTR_SERVICE_NAME]: config.serviceName,
        [otel.ATTR_SERVICE_VERSION]: '0.1.0',
      }),
      spanProcessors: [processor],
      instrumentations: [otel.getNodeAutoInstrumentations()],
    });

    process.on('SIGTERM', () => {
      sdk.shutdown().catch(() => {}).finally(() => process.exit(0));
    });

    await sdk.start();
    console.log(`🔭 OpenTelemetry: service=${config.serviceName} exporter=${config.exporter}`);
  } catch (err: any) {
    console.warn(`⚠ OpenTelemetry packages not installed — tracing disabled. (${err.message})`);
    config.enabled = false;
  }

  return config;
}

/**
 * Create a tracer for manual instrumentation. No-op when OTel is disabled.
 */
export function createTracer(name: string) {
  let getTracerFn: ((name: string) => any) | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api: any = require('@opentelemetry/api');
    getTracerFn = (n: string) => api.trace.getTracer(n);
  } catch {
    // OTel not available
  }

  return {
    withSpan: async <T>(spanName: string, fn: (span: Span) => Promise<T>): Promise<T> => {
      if (!getTracerFn) return fn(noopSpan);

      const tracer = getTracerFn(name);
      const span = tracer.startSpan(spanName) as Span;
      try {
        const result = await fn(span);
        span.ok();
        return result;
      } catch (err) {
        span.error(err);
        throw err;
      } finally {
        span.end();
      }
    },
  };
}

/**
 * Create a metrics counter. No-op when Prometheus exporter is not configured.
 */
export function createCounter(
  _name: string,
  _description: string,
): { inc: (labels?: Record<string, string>) => void } {
  return { inc: () => {} };
}

/**
 * Structured log entry with trace context injection.
 */
export function logWithTrace(
  logger: Logger,
  level: 'info' | 'warn' | 'error',
  data: Record<string, unknown>,
  msg?: string,
): void {
  let traceId: string | undefined;
  let spanId: string | undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api: any = require('@opentelemetry/api');
    const span = api.trace.getActiveSpan();
    if (span) {
      const ctx = span.spanContext();
      traceId = ctx.traceId;
      spanId = ctx.spanId;
    }
  } catch {
    // OTel not available
  }

  logger[level]({ ...data, traceId, spanId }, msg);
}
