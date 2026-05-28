import type { LogRecord, LoggerFormat } from './types'

const ANSI = {
    reset: '\u001b[0m',
    bold: '\u001b[1m',
    dim: '\u001b[2m',
    italic: '\u001b[3m',
    red: '\u001b[31m',
    green: '\u001b[32m',
    yellow: '\u001b[33m',
    blue: '\u001b[34m',
    magenta: '\u001b[35m',
    cyan: '\u001b[36m',
    gray: '\u001b[90m',
}

const getLevelColor = (level: LogRecord['level']): string => {
    switch (level) {
        case 'debug': return ANSI.cyan
        case 'info': return ANSI.blue
        case 'warn': return ANSI.yellow
        case 'error': return ANSI.red
        case 'fatal': return ANSI.magenta
        default: return ANSI.gray
    }
}

export const buildHumanReadableMessage = (record: LogRecord): string => {
    const parts = [`[${record.level.toUpperCase()}]`, `[${record.service}]`, record.message]

    if (record.tags.length > 0) {
        parts.push(`tags=${record.tags.join(',')}`)
    }

    if (record.requestId) {
        parts.push(`requestId=${record.requestId}`)
    }

    return parts.join(' | ')
}

export const formatLogRecordForConsole = (record: LogRecord): string => {
    const levelLabel = `${ANSI.bold}${getLevelColor(record.level)}${record.level.toUpperCase()}${ANSI.reset}`
    const serviceLabel = `${ANSI.italic}${record.service}${ANSI.reset}`
    const suffix: string[] = []

    if (record.success) {
        suffix.push(`${ANSI.bold}${ANSI.green}success${ANSI.reset}`)
    }

    if (record.failed) {
        suffix.push(`${ANSI.bold}${ANSI.red}failed${ANSI.reset}`)
    }

    const requestSuffix = record.requestId ? ` ${ANSI.dim}requestId=${record.requestId}${ANSI.reset}` : ''

    return `[${levelLabel}] | [${serviceLabel}] | ${record.message}${suffix.length > 0 ? ` ${suffix.join(' ')}` : ''}${requestSuffix}`
}

export const formatLogRecordForJson = (record: LogRecord): string => JSON.stringify(record)

export const formatLogRecord = (record: LogRecord, format: LoggerFormat): string =>
    format === 'json' ? formatLogRecordForJson(record) : formatLogRecordForConsole(record)