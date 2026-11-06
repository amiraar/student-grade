// Reads an answer key the way teachers type it. Every letter is one question, as in the quick input
// of the grade page: "A,B,C", one per line, "ABC" and "AB\nC" all mean three questions.
//
// Numbering is dropped only when a letter follows it ("1. A", "2) B", "3 C"). Anything else that is
// not a letter or a separator stays in the result, so the server refuses it with the question's
// number. Dropping it here could shift every later answer onto the wrong question without a word.
const NUMBERING = /\d+\s*[.):-]?\s*(?=[a-zA-Z])/g
const SEPARATORS = /[\s,;.:/|()]+/g

// What each section accepts, for the messages next to a wrong letter
export const ANSWER_HELP = { pg: 'Pakai huruf A–E.', bs: 'Pakai huruf B atau S.', mj: 'Pakai huruf A–K.' }

export const parseAnswers = (text) => [...String(text ?? '').replace(NUMBERING, '').replace(SEPARATORS, '').toUpperCase()]

const buildSection = (text) => parseAnswers(text).map((answer, index) => ({ no: index + 1, answer }))

// form: { pg, bs, mj }, the text of each section
export const buildAnswerKey = (form) => ({
  pg: buildSection(form.pg),
  bs: buildSection(form.bs),
  mj: buildSection(form.mj)
})
