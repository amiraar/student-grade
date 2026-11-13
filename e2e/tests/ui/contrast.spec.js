// Text must stay readable: WCAG AA colour contrast, checked by axe on every page.
import AxeBuilder from '@axe-core/playwright'
import { test, expect, loginAs } from './fixtures.js'
import { answers, scenario } from '../helpers.js'

async function contrastProblems(page) {
  // Pages fade in: measure the final colours, not a frame of the animation
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))
  const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => `${node.target.join(' ')}: ${node.any[0]?.message ?? node.failureSummary}`)
  )
}

test('the login page has enough colour contrast', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible()
  expect(await contrastProblems(page)).toEqual([])
})

test('every page has enough colour contrast', async ({ page, request }) => {
  const ctx = await scenario(request)
  await ctx.api.post('/grade', { exam_id: ctx.exam.id, student_id: ctx.student.id, answers: { pg: answers('ABCDE') } })
  await loginAs(page, ctx.token)

  const problems = []
  for (const path of ['/', '/classes', `/classes/${ctx.klass.id}`, '/students', `/students/${ctx.student.id}`, '/exams', `/exams/${ctx.exam.id}`, `/exams/${ctx.exam.id}/results`, '/grade', '/reports']) {
    await page.goto(path)
    await expect(page.locator('main h1').first(), path).toBeVisible()
    await page.waitForLoadState('networkidle')
    for (const problem of await contrastProblems(page)) problems.push(`${path} ${problem}`)
  }
  expect(problems).toEqual([])
})
