import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnswerKey, parseAnswers } from '../frontend/src/lib/answerKey.js'

const read = (text) => parseAnswers(text).join('')

test('answer key: every way of writing the same letters gives the same questions', () => {
  for (const text of [
    'A,B,C,D',
    'A, B, C, D',
    'A B C D',
    'A;B;C;D',
    'A.B.C.D',
    'A/B/C/D',
    'A|B|C|D',
    'A\nB\nC\nD',
    'A\r\nB\r\nC\r\nD',
    'A\tB\tC\tD',
    'ABCD',
    'AB\nCD',
    'A,BC D',
    'abcd',
    ' \n A,,B ,\n\n C;; D \n',
    '(A) (B) (C) (D)'
  ]) {
    assert.equal(read(text), 'ABCD', JSON.stringify(text))
  }
})

test('answer key: letters run together on several lines', () => {
  assert.equal(read('AA\nBA\nCCA\nDDAB'), 'AABACCADDAB')
})

test('answer key: numbering before a letter is dropped', () => {
  for (const text of ['1. A\n2. B\n3. C', '1.A 2.B 3.C', '1) A\n2) B\n3) C', '1 A\n2 B\n3 C', '1: A 2: B 3: C', '1-A 2-B 3-C', '1A 2B 3C', '1A2B3C', '10. A\n11. B\n12. C']) {
    assert.equal(read(text), 'ABC', JSON.stringify(text))
  }
})

test('answer key: what is not an answer stays, so the server refuses it instead of shifting the numbering', () => {
  assert.deepEqual(parseAnswers('A,-,C'), ['A', '-', 'C'])
  assert.deepEqual(parseAnswers('A,1,C'), ['A', '1', 'C'])
  assert.deepEqual(parseAnswers('A,1'), ['A', '1'])
  assert.deepEqual(parseAnswers('A,?,C'), ['A', '?', 'C'])
  assert.deepEqual(parseAnswers('AZ'), ['A', 'Z'])
})

test('answer key: empty input means no questions', () => {
  for (const text of ['', '   ', '\n\n', ',;', null, undefined]) {
    assert.deepEqual(parseAnswers(text), [], JSON.stringify(text))
  }
})

test('answer key: sections are numbered from 1 on their own', () => {
  assert.deepEqual(buildAnswerKey({ pg: 'AB', bs: 'S', mj: '' }), {
    pg: [{ no: 1, answer: 'A' }, { no: 2, answer: 'B' }],
    bs: [{ no: 1, answer: 'S' }],
    mj: []
  })
})
