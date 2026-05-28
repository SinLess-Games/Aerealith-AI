import {
    DEFAULT_QUEUE_MAX_ATTEMPTS,
    DEFAULT_QUEUE_MAX_BYTES,
    DEFAULT_RETRY_BASE_DELAY_MS,
    DEFAULT_RETRY_MAX_DELAY_MS,
    type LogRecord,
    type LoggerOptions,
    type QueueItem,
} from './types'
import { readEnvValue } from './runtime'
import { authorizationHeader, byteLength, loadQueue, lokiPayload, queuePath, resolveLokiEndpoint, resolveLokiToken, resolveLokiUsername, saveQueue } from './loki-utils'

export class LokiTransport {
    private readonly queue: QueueItem[] = []
    private flushTimer: ReturnType<typeof setTimeout> | undefined
    private flushing = false
    private initialized = false

    constructor(private readonly options: Required<Pick<NonNullable<LoggerOptions['loki']>, 'bufferFilePath' | 'maxQueueBytes' | 'maxAttempts' | 'retryBaseDelayMs' | 'retryMaxDelayMs'>> & { endpoint: string; token: string; username?: string }) {
        void this.initialize()
    }

    async initialize(): Promise<void> {
        if (this.initialized) return
        this.initialized = true
        this.queue.push(...await loadQueue(this.options.bufferFilePath))
        if (this.queue.length > 0) this.scheduleFlush(0)
    }

    hasPending(): boolean { return this.queue.length > 0 }

    enqueue(record: LogRecord): void {
        this.queue.push({ record, attempts: 0, nextAttemptAt: Date.now(), sizeBytes: byteLength(JSON.stringify(record)) })
        this.enforceLimit()
        void saveQueue(this.options.bufferFilePath, this.queue)
        this.scheduleFlush(0)
    }

    async sendImmediately(record: LogRecord): Promise<void> { await this.send(record) }

    async flush(): Promise<void> {
        if (this.flushing) return
        this.flushing = true

        try {
            while (this.queue.length > 0) {
                const now = Date.now()
                const index = this.queue.findIndex((item) => item.nextAttemptAt <= now)
                if (index < 0) {
                    this.scheduleFlush(Math.max(0, Math.min(...this.queue.map((item) => item.nextAttemptAt)) - now))
                    return
                }

                const item = this.queue.splice(index, 1)[0]
                try {
                    await this.send(item.record)
                } catch {
                    if (item.attempts + 1 < this.options.maxAttempts) {
                        item.attempts += 1
                        item.nextAttemptAt = Date.now() + Math.min(this.options.retryMaxDelayMs, this.options.retryBaseDelayMs * 2 ** (item.attempts - 1))
                        this.queue.push(item)
                    }
                    break
                }
            }
            await saveQueue(this.options.bufferFilePath, this.queue)
        } finally {
            this.flushing = false
        }
    }

    async close(): Promise<void> { if (this.flushTimer) clearTimeout(this.flushTimer); await this.flush() }

    private enforceLimit(): void {
        let bytes = this.queue.reduce((sum, item) => sum + item.sizeBytes, 0)
        while (bytes > this.options.maxQueueBytes && this.queue.length > 0) {
            const dropped = this.queue.shift()
            if (dropped) bytes -= dropped.sizeBytes
        }
    }

    private scheduleFlush(delayMs: number): void {
        if (this.flushTimer) clearTimeout(this.flushTimer)
        this.flushTimer = setTimeout(() => { void this.flush() }, Math.max(0, delayMs))
    }

    private async send(record: LogRecord): Promise<void> {
        const response = await fetch(this.options.endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(authorizationHeader({ loki: { token: this.options.token, username: this.options.username } }) ? { authorization: authorizationHeader({ loki: { token: this.options.token, username: this.options.username } })! } : {}),
            },
            body: lokiPayload(record),
        })

        if (!response.ok) throw new Error(`Loki push failed with status ${response.status}`)
    }
}

export const createLokiTransport = (options: LoggerOptions): LokiTransport | undefined => {
    const enabled = options.loki?.enabled !== false && (options.transport === 'loki' || options.transport === 'both' || (options.transport === 'auto' || options.transport === undefined) && readEnvValue(options.env, 'NODE_ENV') === 'production')
    const endpoint = resolveLokiEndpoint(options)
    const token = resolveLokiToken(options)

    if (!enabled || !endpoint || !token) return undefined

    return new LokiTransport({
        endpoint,
        token,
        username: resolveLokiUsername(options),
        bufferFilePath: queuePath(options),
        maxQueueBytes: options.loki?.maxQueueBytes ?? DEFAULT_QUEUE_MAX_BYTES,
        maxAttempts: options.loki?.maxAttempts ?? DEFAULT_QUEUE_MAX_ATTEMPTS,
        retryBaseDelayMs: options.loki?.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
        retryMaxDelayMs: options.loki?.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS,
    })
}