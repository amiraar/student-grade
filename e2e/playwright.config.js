import { defineConfig, devices } from '@playwright/test'

const PORT = 54173

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0, // a flaky test should be visible, not retried away
  workers: 4,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  globalTeardown: './harness/teardown.mjs',
  webServer: {
    command: 'node harness/start.mjs',
    url: `http://127.0.0.1:${PORT}/login`,
    timeout: 5 * 60_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe'
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'desktop', testDir: './tests/ui', testIgnore: '**/mobile.spec.js', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testDir: './tests/ui', testMatch: '**/mobile.spec.js', use: { ...devices['Pixel 7'] } },
    // Many Android phones are 360px wide, narrower than the Pixel 7
    { name: 'mobile-small', testDir: './tests/ui', testMatch: '**/mobile.spec.js', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 740 } } }
  ]
})
