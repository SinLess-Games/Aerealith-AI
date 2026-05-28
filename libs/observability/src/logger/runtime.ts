import {
    type AsyncLocalStorageLike,
    type LogContext,
    type RuntimeMode,
} from './types'

const NODE_BUILTINS_PREFIX = 'node:'
const ASYNC_LOCAL_STORAGE_KEY = Symbol.for('aerealith.observability.asyncLocalStorage')

const normalizeText = (value: string): string => {
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

const isNodeRuntimeInternal = (): boolean => typeof process !== 'undefined' && Boolean(process.versions?.node)

const tryRequire = <T>(specifier: string): T | undefined => {
    if (!isNodeRuntimeInternal()) {
        return undefined
    }

    try {
        const nodeRequire = Function('return require')() as (specifier: string) => T

        return nodeRequire(specifier)
    } catch {
        return undefined
    }
}

export const detectRuntime = (): RuntimeMode => {
    if (isNodeRuntimeInternal()) {
        return 'node'
    }

    if (typeof navigator !== 'undefined' && /Cloudflare-Workers/i.test(navigator.userAgent)) {
        return 'cloudflare-worker'
    }

    if (typeof (globalThis as { document?: unknown }).document !== 'undefined') {
        return 'browser'
    }

    return 'unknown'
}

export const readEnvValue = (
    env: Record<string, string | undefined> | undefined,
    key: string,
): string | undefined => {
    const explicit = env?.[key]

    if (typeof explicit === 'string' && explicit.trim().length > 0) {
        return explicit.trim()
    }

    if (isNodeRuntimeInternal() && typeof process.env[key] === 'string') {
        const value = process.env[key]

        if (value && value.trim().length > 0) {
            return value.trim()
        }
    }

    return undefined
}

export const createRequestId = (): string => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID()
    }

    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        const bytes = new Uint8Array(16)

        globalThis.crypto.getRandomValues(bytes)
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80

        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

        return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
    }

    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

export const normalizeRequestId = (value: string | undefined): string | undefined => {
    if (!value) {
        return undefined
    }

    const normalized = normalizeText(value)

    return normalized.length > 0 ? normalized : undefined
}

const getNodeAsyncLocalStorage = (): AsyncLocalStorageLike<LogContext> | undefined => {
    const globalRef = globalThis as Record<PropertyKey, unknown>
    const existing = globalRef[ASYNC_LOCAL_STORAGE_KEY]

    if (existing) {
        return existing as AsyncLocalStorageLike<LogContext>
    }

    const asyncHooks = tryRequire<{ AsyncLocalStorage: new <T>() => AsyncLocalStorageLike<T> }>(
        `${NODE_BUILTINS_PREFIX}async_hooks`,
    )

    if (!asyncHooks?.AsyncLocalStorage) {
        return undefined
    }

    const storage = new asyncHooks.AsyncLocalStorage<LogContext>()

    globalRef[ASYNC_LOCAL_STORAGE_KEY] = storage

    return storage
}

export const runWithLogContext = <T>(context: LogContext, callback: () => T): T => {
    const storage = getNodeAsyncLocalStorage()

    if (!storage) {
        return callback()
    }

    return storage.run(context, callback)
}

export const getCurrentLogContext = (): LogContext | undefined => getNodeAsyncLocalStorage()?.getStore()

export const createRequestContext = (options: {
    requestId?: string
    service?: string
    metadata?: Record<string, unknown>
    tags?: string[]
    labels?: Record<string, string>
} = {}): LogContext => ({
    requestId: normalizeRequestId(options.requestId) ?? createRequestId(),
    service: options.service?.trim(),
    metadata: options.metadata,
    tags: options.tags,
    labels: options.labels,
})

export const createRequestContextFromRequest = (
    request: Request,
    options: {
        service?: string
        metadata?: Record<string, unknown>
        tags?: string[]
        labels?: Record<string, string>
        requestIdHeader?: string
    } = {},
): LogContext => {
    const requestIdHeader = options.requestIdHeader?.trim() || 'x-request-id'
    const requestId =
        normalizeRequestId(request.headers.get(requestIdHeader) ?? undefined) ||
        normalizeRequestId(request.headers.get('x-correlation-id') ?? undefined) ||
        createRequestId()

    return {
        requestId,
        service: options.service?.trim(),
        metadata: options.metadata,
        tags: options.tags,
        labels: options.labels,
    }
}

export const isNodeRuntime = isNodeRuntimeInternal
export const tryRequireNodeModule = tryRequire