import { LokiCloud, LOKI_API_TOKEN_ENV } from '../constants/urls'
import { DEFAULT_BUFFER_RELATIVE_PATH, type LogRecord, type LoggerOptions, type QueueItem } from './types'
import { isNodeRuntime, readEnvValue, tryRequireNodeModule } from './runtime'

const getNodeFs = (): any => tryRequireNodeModule<any>('node:fs/promises')
const getNodePath = (): any => tryRequireNodeModule<any>('node:path')
const getNodeBuffer = (): any => tryRequireNodeModule<any>('node:buffer')

export const queuePath = (options: LoggerOptions): string => {
    if (options.loki?.bufferFilePath?.trim()) return options.loki.bufferFilePath.trim()
    if (!isNodeRuntime()) return DEFAULT_BUFFER_RELATIVE_PATH

    const path = getNodePath()
    const cwd = typeof process.cwd === 'function' ? process.cwd() : '.'

    return path ? path.join(cwd, DEFAULT_BUFFER_RELATIVE_PATH) : `${cwd}/${DEFAULT_BUFFER_RELATIVE_PATH}`
}

export const resolveLokiEndpoint = (options: LoggerOptions): string | undefined => options.loki?.endpoint?.trim() || LokiCloud.pushURL
export const resolveLokiUsername = (options: LoggerOptions): string | undefined => options.loki?.username?.trim() || LokiCloud.user
export const resolveLokiToken = (options: LoggerOptions): string | undefined => options.loki?.token?.trim() || readEnvValue(options.env, LOKI_API_TOKEN_ENV)

export const authorizationHeader = (options: LoggerOptions): string | undefined => {
    const token = resolveLokiToken(options)
    const username = resolveLokiUsername(options)

    if (!token) return undefined
    if (!username) return `Bearer ${token}`

    const raw = `${username}:${token}`

    return typeof globalThis.btoa === 'function' ? `Basic ${globalThis.btoa(raw)}` : `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`
}

export const lokiPayload = (record: LogRecord): string => JSON.stringify({
    streams: [{
        stream: { service: record.service, level: record.level, runtime: record.runtime, transport: 'loki' },
        values: [[`${Date.parse(record.timestamp) || Date.now()}000000`, JSON.stringify(record)]],
    }],
})

export const byteLength = (value: string): number => {
    const buffer = getNodeBuffer()

    return buffer ? buffer.byteLength(value, 'utf8') : new TextEncoder().encode(value).length
}

export const loadQueue = async (filePath: string): Promise<QueueItem[]> => {
    const fs = getNodeFs()

    if (!fs) return []

    try {
        const contents = await fs.readFile(filePath, 'utf8')
        return contents.split('\n').filter(Boolean).flatMap((line: string) => {
            try { return [JSON.parse(line) as QueueItem] } catch { return [] }
        })
    } catch {
        return []
    }
}

export const saveQueue = async (filePath: string, queue: QueueItem[]): Promise<void> => {
    const fs = getNodeFs()

    if (!fs) return

    const path = getNodePath()

    if (path) await fs.mkdir(path.dirname(filePath), { recursive: true })

    await fs.writeFile(filePath, queue.map((item) => JSON.stringify(item)).join('\n'), 'utf8')
}