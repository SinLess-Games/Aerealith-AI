import {
    createLogger,
    createRequestContext,
    createRequestContextFromRequest,
    formatLogRecordForConsole,
    formatLogRecordForJson,
    redactSensitiveLogValue,
} from './index'

describe('observability logger', () => {
    it('redacts sensitive values recursively', () => {
        const redacted = redactSensitiveLogValue({
            apiKey: 'abc123',
            nested: {
                password: 'super-secret',
                token: 'Bearer abc.def.ghi',
            },
        })

        expect(redacted).toEqual({
            apiKey: '[redacted]',
            nested: {
                password: '[redacted]',
                token: '[redacted]',
            },
        })
    })

    it('formats console output with the requested shape', () => {
        const record = createLogger({ service: 'billing', transport: 'console' }).info('Payment captured', {
            requestId: 'req_123',
            tags: ['success'],
            success: true,
        })

        expect(formatLogRecordForConsole(record)).toContain('[INFO] | [billing] |')
        expect(formatLogRecordForConsole(record)).toContain('Payment captured')
    })

    it('formats json output with service and request data', () => {
        const record = createLogger({ service: 'billing', transport: 'console' }).error('Payment failed', {
            requestId: 'req_456',
            metadata: { cardNumber: '4111111111111111' },
            error: new Error('boom'),
        })

        const payload = JSON.parse(formatLogRecordForJson(record)) as Record<string, unknown>

        expect(payload['service']).toBe('billing')
        expect(payload['requestId']).toBe('req_456')
        expect(payload['metadata']).toEqual({ cardNumber: '4111111111111111' })
        expect(payload['humanReadableMessage']).toContain('billing')
    })

    it('creates request contexts from Request objects', () => {
        const request = new Request('https://example.com/test', {
            headers: {
                'x-request-id': 'req_from_header',
            },
        })

        const context = createRequestContextFromRequest(request, { service: 'api' })

        expect(context.requestId).toBe('req_from_header')
        expect(context.service).toBe('api')
    })

    it('creates request contexts with generated request ids', () => {
        const context = createRequestContext({ service: 'api' })

        expect(context.requestId).toMatch(/^req_|^[a-f0-9-]{36}$/i)
    })
})