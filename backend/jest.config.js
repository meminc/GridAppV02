module.exports = {
    testEnvironment: 'node',
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js',
    ],
    testMatch: [
        '**/tests/**/*.test.js',
    ],
    testTimeout: 10000,
};