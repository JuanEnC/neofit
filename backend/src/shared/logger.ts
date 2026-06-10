/**
 * Structured JSON logger for AWS Lambda.
 *
 * All log output goes to stdout, which CloudWatch Logs captures automatically.
 * Using JSON format enables CloudWatch Insights filter queries.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  [key: string]: unknown;
}

// Module-level request ID, set once per invocation from the Lambda context
let currentRequestId: string | undefined;

export function setRequestId(requestId: string): void {
  currentRequestId = requestId;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(currentRequestId && { requestId: currentRequestId }),
    ...meta,
  };

  // Lambda runtime flushes stdout to CloudWatch on each newline
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
};
