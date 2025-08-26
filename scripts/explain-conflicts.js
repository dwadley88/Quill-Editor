// scripts/explain-conflicts.js
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import OpenAI from 'openai';

const repo = process.env.GITHUB_REPOSITORY;
const prNumber = process.env.GITHUB_PR_NUMBER;
const token = process.env.GITHUB_TOKEN;
const baseRef = process.env.BASE_REF || 'main';

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set.');
  process.exit(0); // don't fail the build, just skip
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts }).trim();
  } catch (err) {
    return err.stdout ? err.stdout.toString() : '';
  }
}

function getConflictedFiles() {
  const out = sh('git diff --name-only --diff-filter=U');
  return out.split('\n').filter(Boolean);
}

function attemptMerge(baseRef) {
  // Ensure we have the latest base
  sh('git fetch origin --prune');
  // Configure a user for merge metadata (required for some git versions)
  sh('git config user.email "bot@example.com"');
  sh('git config user.name "Conflict Explainer Bot"');
  // Try a no-commit merge to surface conflicts without creating a merge commit
  sh(`git merge origin/${baseRef} --no-commit --no-ff || true`);
}

function abortMergeIfAny() {
  // Abort if a merge is in progress
  const hasMerge = fs.existsSync('.git/MERGE_HEAD');
  if (hasMerge) {
    sh('git merge --abort || true');
  }
}

// Parse conflict markers into hunks per file
function parseConflictHunks(content) {
  const lines = content.split('\n');
  const hunks = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      const oursLabel = lines[i].slice(7).trim();
      i++;
      const ours = [];
      while (i < lines.length && !lines[i].startsWith('=======')) {
        ours.push(lines[i]); i++;
      }
      // skip =======
      i++;
      const theirs = [];
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        theirs.push(lines[i]); i++;
      }
      const theirsLabel = lines[i]?.slice(7).trim() || '';
      // skip >>>>>>>
      i++;

      // Grab a bit of context around (not strictly necessary)
      hunks.push({
        oursLabel,
        theirsLabel,
        ours: ours.join('\n'),
        theirs: theirs.join('\n')
      });
      continue;
    }
    i++;
  }
  return hunks;
}

function collectConflicts(files) {
  const result = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      const hunks = parseConflictHunks(content);
      if (hunks.length) {
        result.push({ file: f, hunks });
      }
    } catch (e) {
      // ignore unreadable files
    }
  }
  return result;
}

function truncateForTokens(str, max = 30000) {
  if (str.length <= max) return str;
  return str.slice(0, max) + "\n\n[...truncated for length...]";
}

async function generateReport(structuredConflicts) {
  const prompt = `You are an expert code explainer writing for a non-programmer.
You will receive a JSON array of files with merge-conflict hunks.
For EACH file:
- Start with a plain-English summary of WHY the conflict likely happened.
- Then, for EACH hunk, output:
  • "What differs" — a short bullet list describing the key differences between the two versions.
  • "Suggested resolution" — choose KEEP OURS, KEEP THEIRS, or MERGE BOTH with a concrete merged snippet (if safe) and a one-sentence reason.
  • "Line-by-line (only for conflicting lines)" — explain what each meaningful line in the two versions is doing, avoiding jargon where possible.
Keep the tone friendly, concise, and actionable. Use Markdown headings and code fences for any code.
IMPORTANT: Only explain the conflicting hunks, NOT the whole file.`;

  const inputJson = JSON.stringify(structuredConflicts, null, 2);
  const response = await client.responses.create({
    model: "gpt-4o-mini",
    input: truncateForTokens(inputJson),
    reasoning: { effort: "medium" },
    system: prompt,
  });

  // Prefer output_text if available; otherwise compose from content parts
  let text = response.output_text || "";
  if (!text) {
    if (response.output && Array.isArray(response.output)) {
      text = response.output.map(p => p.content?.map(c => c.text).join('')).join('\n');
    } else if (response.content) {
      text = response.content.map(c => c.text || '').join('\n');
    }
  }
  return text || "_The AI did not return any content._";
}

async function postComment(markdown) {
  const url = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
  const body = JSON.stringify({ body: markdown });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body
  });
  if (!res.ok) {
    const t = await res.text();
    console.error('Failed to post comment:', res.status, t);
  }
}

(async () => {
  try {
    attemptMerge(baseRef);
    const files = getConflictedFiles();
    if (!files.length) {
      abortMergeIfAny();
      console.log('No conflicts detected.');
      // Optional: post a small comment; skip to reduce noise.
      process.exit(0);
    }
    const conflicts = collectConflicts(files);
    const report = await generateReport(conflicts);
    const header = `### 🤖 Conflict Explainer Report\n\n**Base:** \\`${baseRef}\\`  \
**PR:** #${prNumber}  \
**Files with conflicts:** ${files.length}\n\n`;
    const final = header + report;
    // Avoid GH comment size limit (~65k). Truncate if necessary.
    const safeFinal = final.length > 63000 ? final.slice(0, 63000) + "\n\n[Comment truncated]" : final;
    await postComment(safeFinal);
  } catch (e) {
    console.error('Error running conflict explainer:', e);
  } finally {
    abortMergeIfAny();
  }
})();
