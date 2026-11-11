// Runs the guardrails eval set (src/evals.js) from the command line: npm run eval
// Exits with an error if any promise is broken, so it can block a release.
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { runAll, LANES } = await server.ssrLoadModule('/src/evals.js')
  const results = await runAll()
  for (const lane of LANES) {
    console.log(`\n${lane.title}`)
    for (const r of results.filter((x) => x.lane === lane.id)) {
      const n = r.wordings.length
      console.log(`  ${r.pass ? '✔' : '✖'} ${r.id} ${r.tests}${n > 1 ? ` (${n} wordings)` : ''}`)
      for (const w of r.wordings.filter((x) => !x.pass)) console.log(`      "${w.body}"\n${w.problems.map((p) => `        - ${p}`).join('\n')}`)
    }
  }
  const failed = results.filter((r) => !r.pass)
  const words = results.flatMap((r) => r.wordings)
  console.log(`\n${results.length - failed.length} of ${results.length} guardrails pass (${words.filter((w) => w.pass).length} of ${words.length} wordings).`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await server.close()
}
