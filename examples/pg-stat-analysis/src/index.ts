import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Inferable } from 'inferable';
import { join } from 'path';
import { z } from 'zod';

const HISTORY_PATH = join(__dirname, 'history.json')

if (!existsSync(HISTORY_PATH)) {
  writeFileSync(HISTORY_PATH, JSON.stringify({ suggestions: [] }));
}

const history = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));

const client = new Inferable()

const resultSchema = z.object({
  summary: z.string(),
  suggestions: z.array(
    z.object({
      name: z.string(),
      explanation: z.string().describe("A short explanation of the suggestion"),
      impactedQueries: z.array(z.string()).describe("The SQL queries that will be impacted by the suggestion. Only include queries observed in pg_stat_statements, etc"),
      remediation: z.string().describe("The SQL code to implement the suggestion"),
      impact: z.number().describe("The estimated impact of the suggestion on query performance").min(0).max(10)
    })
  ),
})

client.run({
  initialPrompt: `
Evaluate the access patterns within this database and recomend possible suggestions to improve performance.
This could include creating indexes or other optimizations that will improve performance.

If a query fails, evaluate the error message and try again if possible.

Do not return without evaluating "pg_stat_statements" if the module is enabled.
Do not recomend VACUUM related suggestions if auto-vacuum is enabled.
Do not "infer" possible queries, evaluate them based on "pg_stat_statements" table.

Only return suggestions that haven't been recomended before, it is ok to return no suggestions.
`,
  systemPrompt: `
You are a Postgres DB analysis agent. You have access to a Postgres database and your job is to answer questions about the data in the database.

You have access to run queries against all 'pg_stat_*' tables as necessary to answer your questions.
`,
  model: "claude-3-5-sonnet",
  resultSchema,
  input: history,
})
  .then(run => run.poll())
  .then(runData => {
    const result = runData?.result
    if (!result) {
      console.log("No result")
      return
    }

    const resultData = resultSchema.parse(result)

    writeFileSync(HISTORY_PATH, JSON.stringify({
      suggestions: [
        ...history.suggestions,
        ...resultData.suggestions.map(suggestion => ({
          name: suggestion.name,
          remediation: suggestion.remediation
        })),
      ]
    }));
  })
