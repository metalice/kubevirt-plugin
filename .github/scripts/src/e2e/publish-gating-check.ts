/**
 * Create or update the "Run Gating Tests" check-run.
 * Replaces the inline actions/github-script in the publish-gating-check
 * composite action.
 *
 * Required env: GITHUB_TOKEN, GITHUB_REPOSITORY, CHECK_STATUS, CHECK_TITLE, CHECK_SUMMARY
 * Optional env: CHECK_HEAD_SHA, CHECK_RUN_ID, CHECK_CONCLUSION, CHECK_DETAILS_URL, CHECK_NAME
 *
 * Outputs: check_run_id
 */

import { Octokit } from '@octokit/rest';

import { requireEnv } from '../utils';
import { getRepoContext } from '../shared/actions-context';
import { createCheckRun, updateCheckRun } from '../shared/checks';
import { setOutput, failStep } from '../shared/output';

const main = async (): Promise<void> => {
  const token = requireEnv('GITHUB_TOKEN');
  const octokit = new Octokit({ auth: token });
  const { owner, repo } = getRepoContext();

  const status = requireEnv('CHECK_STATUS') as 'queued' | 'in_progress' | 'completed';
  const title = requireEnv('CHECK_TITLE');
  const summary = requireEnv('CHECK_SUMMARY');
  const conclusion = process.env.CHECK_CONCLUSION || undefined;
  const detailsUrl = process.env.CHECK_DETAILS_URL || undefined;
  const name = process.env.CHECK_NAME || 'Run Gating Tests';
  const existingCheckRunId = process.env.CHECK_RUN_ID || '';
  const headSha = process.env.CHECK_HEAD_SHA || '';

  if (!existingCheckRunId && !headSha) {
    failStep(
      'publish-gating-check requires either CHECK_RUN_ID (to update an existing check-run) ' +
        'or CHECK_HEAD_SHA (to create a new one) -- both were empty.',
    );
  }

  let checkRunId: number;

  if (existingCheckRunId) {
    const id = Number(existingCheckRunId);
    if (!Number.isInteger(id) || id <= 0) {
      failStep(`publish-gating-check received an invalid CHECK_RUN_ID: "${existingCheckRunId}".`);
    }
    checkRunId = await updateCheckRun(octokit, {
      owner,
      repo,
      checkRunId: id,
      status,
      conclusion,
      title,
      summary,
      detailsUrl,
    });
    console.log(`Updated check-run ${checkRunId} to "${status}".`);
  } else {
    checkRunId = await createCheckRun(octokit, {
      owner,
      repo,
      name,
      headSha,
      status,
      conclusion,
      title,
      summary,
      detailsUrl,
    });
    console.log(`Created check-run ${checkRunId} ("${status}") for ${headSha}.`);
  }

  setOutput('check_run_id', String(checkRunId));
};

main().catch((err) => {
  failStep(err instanceof Error ? err.message : String(err));
});
