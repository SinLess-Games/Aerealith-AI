import {
    DEFAULT_CONSOLE_FORMAT,
    DEFAULT_LOG_LEVEL,
    DEFAULT_LOGGER_SERVICE,
    LOGGER_LEVEL_WEIGHTS,
    type LogContext,
    type LogEntryOptions,
    LogLevel,
    type LogRecord,
    type LoggerOptions,
    type ObservabilityLogger,
} from './types'
import { createLokiTransport } from './loki'
import { buildHumanReadableMessage, formatLogRecord } from './format'
import { createRequestId, detectRuntime, getCurrentLogContext, normalizeRequestId, readEnvValue, runWithLogContext } from './runtime'
import { sanitizeLogMetadata, sanitizeLogValue, serializeLogError } from './redaction'

const mergeUniqueStrings = (...arrays: Array<string[] | undefined>): string[] => {
    const values = new Set<string>()

    for (const array of arrays) {
        for (const value of array ?? []) {
            const normalized = value.trim()

            if (normalized) {
                values.add(normalized)
            }
        }
    }

    return Array.from(values)
}

const buildLabels = (baseLabels: Record<string, string>, service: string, level: string, runtime: string): Record<string, string> => ({
    service,
    level,
    runtime,
    transport: 'loki',
    ...baseLabels,
})

const resolveService = (options: LoggerOptions, context?: LogContext): string =>
    options.service?.trim() || context?.service?.trim() || readEnvValue(options.env, 'SERVICE_NAME') || readEnvValue(options.env, 'APP_NAME') || DEFAULT_LOGGER_SERVICE

const shouldEmitLevel = (level: LogLevel, threshold: LogLevel): boolean =>
    LOGGER_LEVEL_WEIGHTS[level] <= LOGGER_LEVEL_WEIGHTS[threshold]

const resolveContext = (options: LoggerOptions): LogContext | undefined => getCurrentLogContext() ?? options.context

const buildRecord = (base: LoggerOptions, level: LogLevel, message: string, options: LogEntryOptions = {}): LogRecord => {
    const context = resolveContext(base)
    const service = resolveService({ ...base, service: options.service ?? base.service }, context)
    const requestId = normalizeRequestId(options.requestId) ?? normalizeRequestId(context?.requestId) ?? createRequestId()
    const metadata = sanitizeLogMetadata({ ...(base.metadata ?? {}), ...(context?.metadata ?? {}), ...(options.metadata ?? {}) })
    const runtime = detectRuntime()
    const labels = buildLabels({ ...(base.labels ?? {}), ...(context?.labels ?? {}), ...(options.labels ?? {}) }, service, level, runtime)
    const tags = mergeUniqueStrings(base.tags, context?.tags, options.tags)
    const serializedError = options.error !== undefined ? serializeLogError(options.error) : undefined
    const timestamp = new Date().toISOString()
    const record: LogRecord = {
        timestamp,
        level,
        service,
        requestId,
        message: sanitizeLogValue(message) as string,
        humanReadableMessage: '',
        tags,
        labels,
        metadata,
        success: options.success,
        failed: options.failed,
        ...(serializedError ? { error: serializedError } : {}),
        ...(serializedError?.stackTrace ? { stackTrace: serializedError.stackTrace } : {}),
        ...(serializedError?.fullStackTrace ? { fullStackTrace: serializedError.fullStackTrace } : {}),
        runtime,
    }

    return { ...record, humanReadableMessage: buildHumanReadableMessage(record) }
}

export const createLogger = (options: LoggerOptions = {}): ObservabilityLogger => {
    const normalized: LoggerOptions = {
        ...options,
        service: options.service?.trim() || DEFAULT_LOGGER_SERVICE,
        level: options.level ?? DEFAULT_LOG_LEVEL,
        consoleFormat: options.consoleFormat ?? DEFAULT_CONSOLE_FORMAT,
    }

    const consoleWriter = (record: LogRecord): void => {
        const output = formatLogRecord(record, normalized.consoleFormat ?? DEFAULT_CONSOLE_FORMAT)

        switch (record.level) {
            case LogLevel.DEBUG:
                console.debug(output)
                return
            case LogLevel.WARN:
                console.warn(output)
                return
            case LogLevel.ERROR:
            case LogLevel.FATAL:
                console.error(output)
                return
            default:
                console.info(output)
        }
    }

    const lokiTransport = createLokiTransport(normalized)

    const emit = (record: LogRecord): LogRecord => {
        if (!shouldEmitLevel(record.level, normalized.level ?? DEFAULT_LOG_LEVEL)) {
            return record
        }

        consoleWriter(record)

        if (lokiTransport) {
            if (lokiTransport.hasPending()) {
                lokiTransport.enqueue(record)
            } else {
                void lokiTransport.sendImmediately(record).catch(() => lokiTransport.enqueue(record))
            }
        }

        return record
    }

    const log = (level: LogLevel, message: string, entryOptions: LogEntryOptions = {}): LogRecord =>
        emit(buildRecord(normalized, level, message, entryOptions))

    const child = (context: LogContext): ObservabilityLogger => createLogger({
        ...normalized,
        context: {
            ...(normalized.context ?? {}),
            ...context,
            metadata: { ...(normalized.context?.metadata ?? {}), ...(context.metadata ?? {}) },
            tags: mergeUniqueStrings(normalized.context?.tags, context.tags),
            labels: { ...(normalized.context?.labels ?? {}), ...(context.labels ?? {}) },
        },
    })

    return {
        debug: (message, entryOptions) => log(LogLevel.DEBUG, message, entryOptions),
        info: (message, entryOptions) => log(LogLevel.INFO, message, entryOptions),
        warn: (message, entryOptions) => log(LogLevel.WARN, message, entryOptions),
        error: (message, entryOptions) => log(LogLevel.ERROR, message, entryOptions),
        fatal: (message, entryOptions) => log(LogLevel.FATAL, message, entryOptions),
        success: (message, entryOptions) => log(LogLevel.INFO, message, { ...entryOptions, success: true, failed: false, tags: mergeUniqueStrings(entryOptions?.tags, ['success']) }),
        failed: (message, entryOptions) => log(entryOptions?.error ? LogLevel.ERROR : LogLevel.WARN, message, { ...entryOptions, success: false, failed: true, tags: mergeUniqueStrings(entryOptions?.tags, ['failed']) }),
        log,
        child,
        withContext: runWithLogContext,
        getContext: () => getCurrentLogContext() ?? normalized.context,
        flush: async () => { if (lokiTransport) await lokiTransport.flush() },
        close: async () => { if (lokiTransport) await lokiTransport.close() },
    }
}

export const logger = createLogger()