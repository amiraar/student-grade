import { test as base, expect } from '@playwright/test'
import { randomIp } from '../helpers.js'

// Each test gets its own IP (rate limits) and fails on browser errors, which is where a
// dependency upgrade usually shows up first. Pass allowedErrors for the ones a test provokes.
export const test = base.extend({
  allowedErrors: [[], { option: true }],
  page: async ({ page, allowedErrors, baseURL }, use) => {
    const ip = randomIp()
    const appOrigin = new URL(baseURL).origin
    await page.route('**/*', (route) => {
      const request = route.request()
      if (new URL(request.url()).origin === appOrigin) {
        return route.continue({ headers: { ...request.headers(), 'x-forwarded-for': ip } })
      }
      // Web fonts and the like: tests must not depend on the internet
      return route.fulfill({ status: 200, contentType: 'text/css', body: '', headers: { 'Access-Control-Allow-Origin': '*' } })
    })
    const problems = []
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.text().includes('[Vue warn]')) problems.push(`console: ${msg.text()}`)
    })
    await use(page)
    const unexpected = problems.filter((p) => !allowedErrors.some((pattern) => pattern.test(p)))
    expect(unexpected, 'unexpected browser errors').toEqual([])
  }
})

export { expect }

// Logs the browser in as an existing teacher without going through the form
export async function loginAs(page, token) {
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('e2e-token-set')) {
      localStorage.setItem('token', value)
      sessionStorage.setItem('e2e-token-set', '1')
    }
  }, token)
}

// Runs the click that starts a download and returns it with its text.
//
// An empty file was seen once in about a thousand runs and could not be reproduced, so the cause is
// unknown. The size of the blob the page made tells a future failure apart: 0 means the app really
// produced an empty file, more than 0 means the app delivered the data and only the read came up empty.
export async function downloadText(page, click) {
  await page.evaluate(() => {
    window.__blobSizes = []
    const original = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      window.__blobSizes.push(blob.size)
      return original(blob)
    }
  })
  const [download] = await Promise.all([page.waitForEvent('download'), click()])
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  const blobSizes = await page.evaluate(() => window.__blobSizes)
  expect(text.length, `downloaded file was empty; the page's blob sizes: [${blobSizes}]`).toBeGreaterThan(0)
  return { download, text }
}

export const selectWithOption =(page, optionText) => page.locator('select').filter({ has: page.locator('option', { hasText: optionText }) })
