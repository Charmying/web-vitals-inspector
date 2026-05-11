import fs from 'fs'
import os from 'os'
import path from 'path'
import { analyzeUrls } from './analyzer'

interface StressOptions {
  urlsFile: string
  reportDir: string
  label: string
  chunkSize: number
  checkpointFile: string
  resume: boolean
  clearCheckpoint: boolean
}

interface MemorySample {
  tSec: number
  rssMb: number
  heapUsedMb: number
  heapTotalMb: number
  externalMb: number
  freeSystemMemMb: number
}

interface StressReport {
  label: string
  startedAt: string
  finishedAt: string
  durationSec: number
  chunkSize: number
  resumedFromCheckpoint: boolean
  requestedUrlCount: number
  processedUrlCount: number
  successfulUrlCount: number
  failedUrlCount: number
  analyzedUrlCount: number
  success: boolean
  peak: {
    rssMb: number
    heapUsedMb: number
    heapTotalMb: number
  }
  samples: MemorySample[]
  errors: string[]
}

interface StressCheckpoint {
  label: string
  urlsFile: string
  chunkSize: number
  createdAt: string
  updatedAt: string
  requestedUrlCount: number
  completedUrls: string[]
}

function mb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100
}

function getOption(argv: string[], key: string, fallback: string): string {
  const prefixed = `--${key}=`
  const inline = argv.find((a) => a.startsWith(prefixed))
  if (inline) return inline.slice(prefixed.length)

  const idx = argv.findIndex((a) => a === `--${key}`)
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]

  return fallback
}

function hasFlag(argv: string[], key: string): boolean {
  const exact = `--${key}`
  const prefixed = `${exact}=`
  return argv.some((arg) => arg === exact || arg.startsWith(prefixed))
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return parsed
}

function parseOptions(argv: string[]): StressOptions {
  const reportDir = getOption(argv, 'report-dir', path.join('reports', 'stress'))
  const label = getOption(argv, 'label', 'local-stress-test')
  const chunkSize = parsePositiveInt(getOption(argv, 'chunk-size', '200'), 200)
  const checkpointFile = getOption(
    argv,
    'checkpoint-file',
    path.join(reportDir, `${label}.checkpoint.json`)
  )
  return {
    urlsFile: getOption(argv, 'urls-file', path.join('scripts', 'stress', 'generated-urls.txt')),
    reportDir,
    label,
    chunkSize,
    checkpointFile,
    resume: hasFlag(argv, 'resume'),
    clearCheckpoint: hasFlag(argv, 'clear-checkpoint')
  }
}

function loadUrls(urlsFile: string): string[] {
  if (!fs.existsSync(urlsFile)) {
    throw new Error(`URLs file not found: ${urlsFile}`)
  }

  const raw = fs.readFileSync(urlsFile, 'utf8')
  const urls = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('http://') || line.startsWith('https://'))

  if (urls.length < 300) {
    throw new Error(`Stress test requires at least 300 URLs; got ${urls.length}`)
  }

  return urls
}

function writeMarkdown(report: StressReport, outputMd: string): void {
  const lines: string[] = []
  lines.push('# Analyzer Stress Test Report')
  lines.push('')
  lines.push(`- Label: ${report.label}`)
  lines.push(`- Started: ${report.startedAt}`)
  lines.push(`- Finished: ${report.finishedAt}`)
  lines.push(`- Duration: ${report.durationSec}s`)
  lines.push(`- Chunk Size: ${report.chunkSize}`)
  lines.push(`- Resumed From Checkpoint: ${report.resumedFromCheckpoint ? 'YES' : 'NO'}`)
  lines.push(`- Requested URLs: ${report.requestedUrlCount}`)
  lines.push(`- Processed URLs: ${report.processedUrlCount}`)
  lines.push(`- Successful URLs: ${report.successfulUrlCount}`)
  lines.push(`- Failed URLs: ${report.failedUrlCount}`)
  lines.push(`- Analyzed URLs: ${report.analyzedUrlCount}`)
  lines.push(`- Success: ${report.success ? 'YES' : 'NO'}`)
  lines.push(`- Peak RSS: ${report.peak.rssMb} MB`)
  lines.push(`- Peak Heap Used: ${report.peak.heapUsedMb} MB`)
  lines.push(`- Peak Heap Total: ${report.peak.heapTotalMb} MB`)

  if (report.errors.length > 0) {
    lines.push('')
    lines.push('## Errors')
    for (const err of report.errors) lines.push(`- ${err}`)
  }

  lines.push('')
  lines.push('## Memory Samples (first 10)')
  lines.push('')
  lines.push('| t(s) | RSS MB | Heap Used MB | Heap Total MB | External MB | Free System MB |')
  lines.push('|---:|---:|---:|---:|---:|---:|')
  for (const s of report.samples.slice(0, 10)) {
    lines.push(`| ${s.tSec} | ${s.rssMb} | ${s.heapUsedMb} | ${s.heapTotalMb} | ${s.externalMb} | ${s.freeSystemMemMb} |`)
  }

  fs.writeFileSync(outputMd, lines.join('\n') + '\n', 'utf8')
}

function loadCheckpoint(checkpointFile: string): StressCheckpoint | null {
  if (!fs.existsSync(checkpointFile)) return null
  try {
    const raw = fs.readFileSync(checkpointFile, 'utf8')
    const parsed = JSON.parse(raw) as Partial<StressCheckpoint>
    if (!parsed || !Array.isArray(parsed.completedUrls)) return null
    return {
      label: parsed.label ?? 'unknown',
      urlsFile: parsed.urlsFile ?? '',
      chunkSize: Number(parsed.chunkSize) || 200,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      requestedUrlCount: Number(parsed.requestedUrlCount) || 0,
      completedUrls: parsed.completedUrls.filter((u): u is string => typeof u === 'string')
    }
  } catch {
    return null
  }
}

function writeCheckpoint(checkpointFile: string, checkpoint: StressCheckpoint): void {
  fs.mkdirSync(path.dirname(checkpointFile), { recursive: true })
  fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2), 'utf8')
}

export async function runStressTestFromCli(argv: string[]): Promise<number> {
  const options = parseOptions(argv)
  const urls = loadUrls(options.urlsFile)
  const startedAt = new Date()
  const startMs = Date.now()

  fs.mkdirSync(options.reportDir, { recursive: true })

  // Clear checkpoint if requested
  if (options.clearCheckpoint && fs.existsSync(options.checkpointFile)) {
    fs.unlinkSync(options.checkpointFile)
    console.info(`[stress] Cleared existing checkpoint: ${options.checkpointFile}`)
  }

  const samples: MemorySample[] = []
  const errors: string[] = []
  const peak = { rssMb: 0, heapUsedMb: 0, heapTotalMb: 0 }

  let resumedFromCheckpoint = false
  const completedSet = new Set<string>()

  if (options.resume) {
    const checkpoint = loadCheckpoint(options.checkpointFile)
    if (checkpoint) {
      resumedFromCheckpoint = true
      for (const url of checkpoint.completedUrls) completedSet.add(url)
      console.info(
        `[stress] Resuming from checkpoint: ${completedSet.size}/${urls.length} already completed`
      )
    } else {
      console.info('[stress] --resume provided but no valid checkpoint found; starting fresh')
    }
  }

  const sampleNow = (): void => {
    const mem = process.memoryUsage()
    const point: MemorySample = {
      tSec: Math.round((Date.now() - startMs) / 1000),
      rssMb: mb(mem.rss),
      heapUsedMb: mb(mem.heapUsed),
      heapTotalMb: mb(mem.heapTotal),
      externalMb: mb(mem.external),
      freeSystemMemMb: mb(os.freemem())
    }
    peak.rssMb = Math.max(peak.rssMb, point.rssMb)
    peak.heapUsedMb = Math.max(peak.heapUsedMb, point.heapUsedMb)
    peak.heapTotalMb = Math.max(peak.heapTotalMb, point.heapTotalMb)
    samples.push(point)
  }

  sampleNow()
  const timer = setInterval(sampleNow, 1000)

  let success = false
  let processedUrlCount = completedSet.size
  let successfulUrlCount = completedSet.size
  let failedUrlCount = 0
  let analyzedUrlCount = completedSet.size

  try {
    const pendingUrls = urls.filter((url) => !completedSet.has(url))
    const chunkSize = Math.max(1, options.chunkSize)
    const chunkCount = Math.ceil(pendingUrls.length / chunkSize)

    console.info(
      `[stress] Starting analyzer: total=${urls.length}, pending=${pendingUrls.length}, ` +
        `chunkSize=${chunkSize}, chunks=${chunkCount}`
    )

    for (let offset = 0; offset < pendingUrls.length; offset += chunkSize) {
      const chunkIndex = Math.floor(offset / chunkSize)
      const chunk = pendingUrls.slice(offset, offset + chunkSize)

      const results = await analyzeUrls(chunk, (p) => {
        const globalCurrent = processedUrlCount + p.current
        console.info(
          `[stress] progress ${globalCurrent}/${urls.length} | ${p.currentUrl || 'processing'}`
        )
      })

      const successfulChunkUrls = results.filter((result) => result.lhr !== null).map((result) => result.url)
      for (const url of successfulChunkUrls) completedSet.add(url)

      processedUrlCount += results.length
      successfulUrlCount = completedSet.size
      failedUrlCount = processedUrlCount - successfulUrlCount
      analyzedUrlCount = successfulUrlCount

      writeCheckpoint(options.checkpointFile, {
        label: options.label,
        urlsFile: options.urlsFile,
        chunkSize,
        createdAt: startedAt.toISOString(),
        updatedAt: new Date().toISOString(),
        requestedUrlCount: urls.length,
        completedUrls: [...completedSet]
      })

      console.info(
        `[stress] chunk ${chunkIndex + 1}/${Math.max(chunkCount, 1)} complete, ` +
          `processed=${processedUrlCount}/${urls.length}, ` +
          `successful=${successfulUrlCount}, failed=${failedUrlCount}`
      )

      if (typeof globalThis.gc === 'function') {
        globalThis.gc()
      }
    }

    success = successfulUrlCount === urls.length && failedUrlCount === 0
  } catch (err) {
    errors.push((err as Error).message ?? String(err))
  } finally {
    clearInterval(timer)
    sampleNow()
  }

  const finishedAt = new Date()
  const durationSec = Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)

  const stamp = `${startedAt.getFullYear()}${String(startedAt.getMonth() + 1).padStart(2, '0')}${String(startedAt.getDate()).padStart(2, '0')}-${String(startedAt.getHours()).padStart(2, '0')}${String(startedAt.getMinutes()).padStart(2, '0')}${String(startedAt.getSeconds()).padStart(2, '0')}`

  const report: StressReport = {
    label: options.label,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSec,
    chunkSize: options.chunkSize,
    resumedFromCheckpoint,
    requestedUrlCount: urls.length,
    processedUrlCount,
    successfulUrlCount,
    failedUrlCount,
    analyzedUrlCount,
    success,
    peak,
    samples,
    errors
  }

  const baseName = `analyzer-stress-${stamp}`
  const outputJson = path.join(options.reportDir, `${baseName}.json`)
  const outputMd = path.join(options.reportDir, `${baseName}.md`)

  fs.writeFileSync(outputJson, JSON.stringify(report, null, 2), 'utf8')
  writeMarkdown(report, outputMd)

  console.info(`[stress] JSON report: ${outputJson}`)
  console.info(`[stress] Markdown report: ${outputMd}`)

  return success ? 0 : 1
}
