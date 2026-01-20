#!/usr/bin/env bun

// Chain trial runner: J -> R1 [-> P2 -> R2 [-> P3 -> R3]] [-> V]
// Generic multi-model chain with optional verdict

import { parse } from 'yaml'
import { join } from 'path'
import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { $ } from 'bun'
import { callModel } from './api'
import { loadConfig } from './loader'
import type { ChainTask, ChainResult, ChainResponse, ChainVerdict, Model } from './types'

const ROOT = join(import.meta.dir, '..')

async function getGitSha(): Promise<string | undefined> {
  try {
    const result = await $`git rev-parse --short HEAD`.quiet().nothrow()
    if (result.exitCode === 0) {
      return result.stdout.toString().trim()
    }
  }
  catch {}
  return undefined
}

interface CLIArgs {
  models: string[]
  task?: string
  verdictModel?: string
  noSystemPrompt?: boolean
  verbose?: boolean
}

function showHelp(): void {
  console.log(`
Usage: bun run trial:chain [options]

Options:
  --models <list>        Comma-separated model IDs for the chain (required)
                         e.g., "llama-3.2-3b,gpt-4o-mini,claude-3-haiku"
  --task <id>            Task ID to run (default: runs all chain tasks)
  --verdict-model <id>   Model for verdict (overrides task default)
  --verbose, -v          Show detailed progress

Chain Structure:
  Judge prompt -> R1 [-> P2 -> R2 [-> P3 -> R3]] [-> Verdict]

  Number of models determines chain length:
    1 model  = (1, verdict?)  J -> R1 -> V?
    2 models = (2, verdict?)  J -> R1 -> P2 -> R2 -> V?
    3 models = (3, verdict?)  J -> R1 -> P2 -> R2 -> P3 -> R3 -> V?

Examples:
  bun run trial:chain --models gpt-4o-mini --task baseline-probe
  bun run trial:chain --models "llama-3.2-3b,gpt-4o" --task correction-test
  bun run trial:chain --models "gpt-4o-mini,claude-3-haiku,gpt-4o" --task debate -v

Results saved to: results/{run-id}/chain_results.jsonl
`)
  process.exit(0)
}

function parseArgs(): CLIArgs {
  const args: CLIArgs = { models: [] }
  const argv = process.argv.slice(2)

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    showHelp()
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const nextArg = argv[i + 1]

    if (arg === '--models' && nextArg) {
      args.models = nextArg.split(',').map(m => m.trim())
      i++
    }
    else if (arg === '--task' && nextArg) {
      args.task = nextArg
      i++
    }
    else if (arg === '--verdict-model' && nextArg) {
      args.verdictModel = nextArg
      i++
    }
    else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true
    }
  }

  return args
}

async function loadChainTasks(): Promise<ChainTask[]> {
  const tasksDir = join(ROOT, 'tasks')
  if (!existsSync(tasksDir)) {
    return []
  }

  const allTasks: ChainTask[] = []
  const glob = new Bun.Glob('*.yml')

  for await (const filename of glob.scan(tasksDir)) {
    const filepath = join(tasksDir, filename)
    const content = await Bun.file(filepath).text()
    const parsed = parse(content)
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      allTasks.push(...parsed.tasks)
    }
  }

  return allTasks
}

function findModel(models: Model[], id: string): Model | undefined {
  return models.find(m => m.id === id)
}

function computeCost(model: Model, tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * model.cost_per_1m_input +
         (tokensOut / 1_000_000) * model.cost_per_1m_output
}

function buildTranscript(
  judgePrompt: string,
  responses: ChainResponse[],
  prompts: string[]
): string {
  let transcript = `User: ${judgePrompt}\n\n`

  for (let i = 0; i < responses.length; i++) {
    const r = responses[i]
    transcript += `Assistant (${r.model}): ${r.response}\n\n`

    if (i < responses.length - 1 && prompts[i]) {
      transcript += `User: ${prompts[i]}\n\n`
    }
  }

  return transcript.trim()
}

function buildStagePrompt(
  judgePrompt: string,
  previousResponses: ChainResponse[],
  prompts: string[],
  stageIndex: number
): string {
  if (stageIndex === 0) {
    return judgePrompt
  }

  let prompt = judgePrompt + '\n\n'

  for (let i = 0; i < previousResponses.length; i++) {
    const r = previousResponses[i]
    prompt += `---\n\nPrevious response:\n\n${r.response}\n\n`

    if (prompts[i]) {
      prompt += prompts[i] + '\n\n'
    }
  }

  return prompt.trim()
}

function buildVerdictPrompt(
  task: ChainTask,
  responses: ChainResponse[]
): string {
  const transcript = buildTranscript(task.judge_prompt, responses, task.prompts || [])

  let prompt = `Review the following exchange:\n\n${transcript}\n\n---\n\n`

  if (task.verdict_prompt) {
    prompt += task.verdict_prompt
  }
  else if (task.verdict_criteria && task.verdict_criteria.length > 0) {
    prompt += 'Rate each response on the following criteria:\n\n'
    for (const c of task.verdict_criteria) {
      const scale = c.scale || [1, 5]
      prompt += `- ${c.id} (${scale[0]}-${scale[1]}): ${c.description}\n`
    }
    prompt += '\nProvide scores in JSON format: {"criterion_id": score, ...}'
  }
  else {
    prompt += 'Evaluate the quality and correctness of the responses. Which response (if any) is best? Explain briefly.'
  }

  return prompt
}

function parseVerdictScores(response: string): Record<string, number> | undefined {
  try {
    const jsonMatch = response.match(/\{[^}]+\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  }
  catch {}
  return undefined
}

async function main() {
  const cliArgs = parseArgs()
  const verbose = cliArgs.verbose ?? false

  if (cliArgs.models.length === 0) {
    console.error('Error: --models is required')
    process.exit(1)
  }

  if (cliArgs.models.length > 3) {
    console.error('Error: Maximum 3 models in chain')
    process.exit(1)
  }

  if (verbose) console.log('Loading config and tasks...')

  const { models: allModels, trials, framework_version } = await loadConfig()
  const chainTasks = await loadChainTasks()
  const git_sha = await getGitSha()

  if (chainTasks.length === 0) {
    console.error('No chain tasks found. Create tasks/chain.yml')
    process.exit(1)
  }

  // Resolve model objects
  const chainModels: Model[] = []
  for (const id of cliArgs.models) {
    const model = findModel(allModels, id)
    if (!model) {
      console.error(`Unknown model: ${id}`)
      process.exit(1)
    }
    chainModels.push(model)
  }

  // Resolve verdict model if specified
  let verdictModel: Model | undefined
  if (cliArgs.verdictModel) {
    verdictModel = findModel(allModels, cliArgs.verdictModel)
    if (!verdictModel) {
      console.error(`Unknown verdict model: ${cliArgs.verdictModel}`)
      process.exit(1)
    }
  }

  // Filter tasks
  let tasks = chainTasks
  if (cliArgs.task) {
    tasks = chainTasks.filter(t => t.id === cliArgs.task)
    if (tasks.length === 0) {
      console.error(`Task not found: ${cliArgs.task}`)
      console.error('Available tasks:', chainTasks.map(t => t.id).join(', '))
      process.exit(1)
    }
  }

  // Setup output
  const runId = `chain-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
  const resultsDir = join(ROOT, 'results', runId)
  mkdirSync(resultsDir, { recursive: true })
  const resultsFile = join(resultsDir, 'chain_results.jsonl')

  if (verbose) {
    console.log(`Framework version: ${framework_version}${git_sha ? ` (${git_sha})` : ''}`)
    console.log(`Chain: ${chainModels.map(m => m.id).join(' -> ')}`)
    if (verdictModel) console.log(`Verdict model: ${verdictModel.id}`)
    console.log(`Tasks: ${tasks.length}`)
    console.log(`Run ID: ${runId}`)
    console.log('')
  }

  const numStages = chainModels.length
  let completed = 0
  const total = tasks.length

  console.log(`Running ${total} chain trials (${numStages} stages)`)
  console.log('')

  for (const task of tasks) {
    completed++

    try {
      const responses: ChainResponse[] = []
      let totalTokensIn = 0
      let totalTokensOut = 0
      let totalLatency = 0
      let totalCost = 0

      // Run each stage
      for (let stage = 0; stage < numStages; stage++) {
        const model = chainModels[stage]
        const prompt = buildStagePrompt(
          task.judge_prompt,
          responses,
          task.prompts || [],
          stage
        )

        const startTime = Date.now()
        const apiResponse = await callModel(
          model.name,
          prompt,
          trials.temperature,
          trials.max_tokens,
          trials.seed
        )
        const latency = Date.now() - startTime
        const cost = computeCost(model, apiResponse.tokens_in, apiResponse.tokens_out)

        const chainResponse: ChainResponse = {
          stage: stage + 1,
          model: model.id,
          prompt,
          response: apiResponse.content,
          tokens_in: apiResponse.tokens_in,
          tokens_out: apiResponse.tokens_out,
          latency_ms: latency,
          cost,
        }

        responses.push(chainResponse)
        totalTokensIn += apiResponse.tokens_in
        totalTokensOut += apiResponse.tokens_out
        totalLatency += latency
        totalCost += cost

        if (verbose) {
          console.log(`  [${task.id}] Stage ${stage + 1} (${model.id}): ${latency}ms, $${cost.toFixed(4)}`)
        }
      }

      // Run verdict if enabled
      let verdict: ChainVerdict | undefined
      const shouldVerdict = task.verdict && (verdictModel || chainModels.length > 0)
      const actualVerdictModel = verdictModel || chainModels[chainModels.length - 1]

      if (shouldVerdict && actualVerdictModel) {
        const verdictPrompt = buildVerdictPrompt(task, responses)

        const startTime = Date.now()
        const apiResponse = await callModel(
          actualVerdictModel.name,
          verdictPrompt,
          0.3,  // Slightly higher temp for nuanced judgment
          trials.max_tokens,
          trials.seed
        )
        const latency = Date.now() - startTime
        const cost = computeCost(actualVerdictModel, apiResponse.tokens_in, apiResponse.tokens_out)

        verdict = {
          model: actualVerdictModel.id,
          prompt: verdictPrompt,
          response: apiResponse.content,
          scores: parseVerdictScores(apiResponse.content),
          tokens_in: apiResponse.tokens_in,
          tokens_out: apiResponse.tokens_out,
          latency_ms: latency,
          cost,
        }

        totalTokensIn += apiResponse.tokens_in
        totalTokensOut += apiResponse.tokens_out
        totalLatency += latency
        totalCost += cost

        if (verbose) {
          console.log(`  [${task.id}] Verdict (${actualVerdictModel.id}): ${latency}ms, $${cost.toFixed(4)}`)
          if (verdict.scores) {
            console.log(`    Scores: ${JSON.stringify(verdict.scores)}`)
          }
        }
      }

      // Build result
      const result: ChainResult = {
        timestamp: new Date().toISOString(),
        run_id: runId,
        framework_version,
        git_sha,
        task_id: task.id,
        models: chainModels.map(m => m.id),
        responses,
        verdict,
        total_tokens_in: totalTokensIn,
        total_tokens_out: totalTokensOut,
        total_latency_ms: totalLatency,
        total_cost: totalCost,
      }

      // Log result
      appendFileSync(resultsFile, JSON.stringify(result) + '\n')

      // Progress
      if (verbose) {
        console.log(`[${completed}/${total}] ${task.id}: ${totalLatency}ms, $${totalCost.toFixed(4)}`)
        console.log('')
      }
      else {
        process.stdout.write('.')
      }
    }
    catch (error) {
      if (verbose) {
        console.error(`Error on ${task.id}:`, error)
      }
      else {
        process.stdout.write('E')
      }
    }
  }

  if (!verbose) console.log('')

  console.log('')
  console.log(`Completed ${completed}/${total} trials`)
  console.log(`Results: ${resultsFile}`)
}

main().catch(console.error)
