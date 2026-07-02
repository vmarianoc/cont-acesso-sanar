import 'dotenv/config'

process.env.JWT_SECRET ??= 'test-secret-please-change'
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret'
process.env.NODE_ENV ??= 'test'
process.env.LOG_LEVEL ??= 'silent'
