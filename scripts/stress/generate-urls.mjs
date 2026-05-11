import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getOption(argv, key, fallback) {
  const exact = `--${key}`
  const prefixed = `${exact}=`
  const inline = argv.find((a) => a.startsWith(prefixed))
  if (inline) return inline.slice(prefixed.length)

  const idx = argv.findIndex((a) => a === exact)
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]

  return fallback
}

const args = process.argv.slice(2)
const PORT = Number(getOption(args, 'port', process.env.STRESS_MOCK_PORT || '4789'))
const HOST = getOption(args, 'host', process.env.STRESS_MOCK_HOST || '127.0.0.1')
const COUNT = Number(getOption(args, 'count', process.env.STRESS_URL_COUNT || '320'))
const OUTPUT = getOption(args, 'output', process.env.STRESS_URL_OUTPUT || join('scripts', 'stress', 'generated-urls.txt'))

if (!Number.isInteger(COUNT) || COUNT < 300) {
  console.error('[stress-generate] STRESS_URL_COUNT must be an integer >= 300')
  process.exit(1)
}

const lines = []
for (let i = 1; i <= COUNT; i++) {
  lines.push(`http://${HOST}:${PORT}/page/${i}`)
}

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf8')
console.log(`[stress-generate] wrote ${COUNT} URLs to ${OUTPUT}`)
