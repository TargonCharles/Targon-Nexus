// Lightweight structured logger — zero-dependency, JSON-compatible output.
// Used by all ARP pipeline services (crawler, extractor, graph-builder,
// scheduler, worker).

export interface Logger {
  info(objOrMsg: unknown, msg?: string): void;
  warn(objOrMsg: unknown, msg?: string): void;
  error(objOrMsg: unknown, msg?: string): void;
  debug(objOrMsg: unknown, msg?: string): void;
  fatal(objOrMsg: unknown, msg?: string): void;
}

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

function currentLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return env in LEVELS ? (env as LogLevel) : "info";
}

function formatLine(
  level: LogLevel,
  name: string,
  data: unknown,
  msg?: string,
): string {
  const ts = new Date().toISOString();
  const body: Record<string, unknown> = { ts, level, name };

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    Object.assign(body, data as Record<string, unknown>);
    if (msg) body.msg = msg;
  } else if (msg) {
    body.msg = msg;
    body.data = data;
  } else {
    body.msg = String(data);
  }

  return JSON.stringify(body);
}

export function createLogger(name: string): Logger {
  const write = (level: LogLevel, data: unknown, msg?: string) => {
    if (LEVELS[level] < LEVELS[currentLevel()]) return;
    const line = formatLine(level, name, data, msg);
    if (level === "error" || level === "fatal") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  };

  return {
    info: (data, msg) => write("info", data, msg),
    warn: (data, msg) => write("warn", data, msg),
    error: (data, msg) => write("error", data, msg),
    debug: (data, msg) => write("debug", data, msg),
    fatal: (data, msg) => write("fatal", data, msg),
  };
}
