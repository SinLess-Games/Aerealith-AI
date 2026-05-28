export const LogLevel = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    FATAL: 'fatal',
} as const

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel]

export type LoggerTransport = 'auto' | 'console' | 'loki' | 'both'

export type LoggerFormat = 'console' | 'json'

export type LogContext = {
    requestId?: string
    service?: string
    metadata?: Record<string, unknown>
    tags?: string[]
    labels?: Record<string, string>
}

export type LogEntryOptions = {
    requestId?: string
    service?: string
    metadata?: Record<string, unknown>
    tags?: string[]
    labels?: Record<string, string>
    error?: unknown
    success?: boolean
    failed?: boolean
}

export type LoggerOptions = {
    service?: string
    level?: LogLevel
    transport?: LoggerTransport
    consoleFormat?: LoggerFormat
    metadata?: Record<string, unknown>
    tags?: string[]
    labels?: Record<string, string>
    context?: LogContext
    env?: Record<string, string | undefined>
    loki?: {
        enabled?: boolean
        endpoint?: string
        token?: string
        username?: string
        bufferFilePath?: string
        maxQueueBytes?: number
        maxAttempts?: number
        retryBaseDelayMs?: number
        retryMaxDelayMs?: number
    }
}

export type SerializedError = {
    name: string
    message: string
    code?: string | number
    status?: number
    stackTrace?: string
    fullStackTrace?: string
    cause?: unknown
}

export type LogRecord = {
    timestamp: string
    level: LogLevel
    service: string
    requestId: string
    message: string
    humanReadableMessage: string
    tags: string[]
    labels: Record<string, string>
    metadata: Record<string, unknown>
    success?: boolean
    failed?: boolean
    error?: SerializedError
    stackTrace?: string
    fullStackTrace?: string
    runtime: string
}

export type ObservabilityLogger = {
    debug: (message: string, options?: LogEntryOptions) => LogRecord
    info: (message: string, options?: LogEntryOptions) => LogRecord
    warn: (message: string, options?: LogEntryOptions) => LogRecord
    error: (message: string, options?: LogEntryOptions) => LogRecord
    fatal: (message: string, options?: LogEntryOptions) => LogRecord
    success: (message: string, options?: LogEntryOptions) => LogRecord
    failed: (message: string, options?: LogEntryOptions) => LogRecord
    log: (level: LogLevel, message: string, options?: LogEntryOptions) => LogRecord
    child: (context: LogContext) => ObservabilityLogger
    withContext: <T>(context: LogContext, callback: () => T) => T
    getContext: () => LogContext | undefined
    flush: () => Promise<void>
    close: () => Promise<void>
}

export type AsyncLocalStorageLike<T> = {
    run: <R>(store: T, callback: () => R) => R
    getStore: () => T | undefined
}

export type QueueItem = {
    record: LogRecord
    attempts: number
    nextAttemptAt: number
    sizeBytes: number
}

export type RuntimeMode = 'node' | 'cloudflare-worker' | 'browser' | 'unknown'

export const DEFAULT_LOG_LEVEL: LogLevel = LogLevel.INFO
export const DEFAULT_LOGGER_SERVICE = 'aerealith-observability'
export const DEFAULT_CONSOLE_FORMAT: LoggerFormat = 'console'
export const DEFAULT_QUEUE_MAX_BYTES = 300 * 1024 * 1024
export const DEFAULT_QUEUE_MAX_ATTEMPTS = 5
export const DEFAULT_RETRY_BASE_DELAY_MS = 1_000
export const DEFAULT_RETRY_MAX_DELAY_MS = 30_000
export const DEFAULT_BUFFER_RELATIVE_PATH = '.aerealith-ai/observability/loki-buffer.jsonl'

export const LOGGER_LEVEL_WEIGHTS: Record<LogLevel, number> = {
    [LogLevel.FATAL]: 0,
    [LogLevel.ERROR]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.INFO]: 3,
    [LogLevel.DEBUG]: 4,
}