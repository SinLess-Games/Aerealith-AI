import type { SerializedError } from './types'

const SENSITIVE_KEY_PATTERN = /(api[-_ ]?key|secret|token|password|passphrase|authorization|cookie|session|bearer|private[-_ ]?key|refresh[-_ ]?token|access[-_ ]?token|client[-_ ]?secret|x[-_ ]?api[-_ ]?key)/i

const SENSITIVE_VALUE_PATTERNS = [
    /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
    /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
    /\b(?:sk|pk|rk)_(?:live|test)?_[A-Za-z0-9]{10,}\b/g,
]

const stripControlChars = (value: string): string => {
    let output = ''

    for (const character of value) {
        const codePoint = character.charCodeAt(0)

        if ((codePoint >= 0 && codePoint <= 31) || (codePoint >= 127 && codePoint <= 159)) {
            continue
        }

        output += character
    }

    return output.trim()
}

export const isSensitiveLogValue = (value: string): boolean => {
    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
        pattern.lastIndex = 0

        if (pattern.test(value)) {
            return true
        }
    }

    return false
}

export const redactSensitiveText = (value: string): string => {
    let output = stripControlChars(value)

    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
        output = output.replace(pattern, '[redacted]')
    }

    return output
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null) {
        return false
    }

    const prototype = Object.getPrototypeOf(value)

    return prototype === Object.prototype || prototype === null
}

const buildFullStackTrace = (error: Error): string => {
    const parts: string[] = []
    const seen = new Set<unknown>()
    let current: unknown = error

    while (current instanceof Error && !seen.has(current)) {
        seen.add(current)
        parts.push(current.stack ? redactSensitiveText(current.stack) : `${current.name}: ${current.message}`)
        current = 'cause' in current ? (current as Error & { cause?: unknown }).cause : undefined

        if (current instanceof Error) {
            parts.push('Caused by:')
        }
    }

    return parts.join('\n')
}

export const serializeLogError = (error: unknown): SerializedError => {
    if (error instanceof Error) {
        const cause = 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined

        return {
            name: error.name,
            message: redactSensitiveText(error.message),
            ...('code' in error && (typeof (error as Error & { code?: unknown }).code === 'string' || typeof (error as Error & { code?: unknown }).code === 'number')
                ? { code: (error as Error & { code?: string | number }).code }
                : {}),
            ...(typeof (error as Error & { status?: unknown }).status === 'number'
                ? { status: (error as Error & { status?: number }).status }
                : {}),
            ...(error.stack ? { stackTrace: redactSensitiveText(error.stack) } : {}),
            ...('cause' in error && cause !== undefined ? { cause: sanitizeLogValue(cause) } : {}),
            ...(error.stack || cause ? { fullStackTrace: buildFullStackTrace(error) } : {}),
        }
    }

    return { name: 'UnknownError', message: redactSensitiveText(String(error)) }
}

export const sanitizeLogValue = (value: unknown, key = '', seen: WeakSet<object> = new WeakSet()): unknown => {
    if (value === null || value === undefined) {
        return value
    }

    if (typeof value === 'string') {
        return SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactSensitiveText(value)
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value
    }

    if (typeof value === 'bigint') {
        return value.toString()
    }

    if (typeof value === 'symbol') {
        return value.description ?? value.toString()
    }

    if (typeof value === 'function') {
        return '[function]'
    }

    if (value instanceof Date) {
        return value.toISOString()
    }

    if (value instanceof URL) {
        return value.toString()
    }

    if (value instanceof Error) {
        return serializeLogError(value)
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeLogValue(item, key, seen))
    }

    if (typeof value === 'object') {
        if (seen.has(value)) {
            return '[Circular]'
        }

        seen.add(value)

        if (isPlainObject(value)) {
            const sanitized: Record<string, unknown> = {}

            for (const [entryKey, entryValue] of Object.entries(value)) {
                sanitized[entryKey] = sanitizeLogValue(entryValue, entryKey, seen)
            }

            return sanitized
        }

        if ('toJSON' in value && typeof value.toJSON === 'function') {
            try {
                return sanitizeLogValue(value.toJSON(), key, seen)
            } catch {
                return '[UnserializableObject]'
            }
        }

        return '[Object]'
    }

    return value
}

export const sanitizeLogMetadata = (metadata: Record<string, unknown>): Record<string, unknown> => {
    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(metadata)) {
        sanitized[key] = sanitizeLogValue(value, key)
    }

    return sanitized
}

export const redactSensitiveLogValue = <T>(value: T): T => sanitizeLogValue(value) as T