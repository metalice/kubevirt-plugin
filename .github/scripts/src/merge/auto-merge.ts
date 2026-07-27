/**
 * Auto-merge: determine merge-pool eligibility and toggle GitHub auto-merge.
 * Entry point: npx tsx src/merge/auto-merge.ts
 *
 * Required env: GITHUB_TOKEN, BOT_TOKEN (optional), GITHUB_REPOSITORY,
 *               PR_NUMBER
 *
 * The native job check ("Auto Merge / Evaluate Merge Eligibility") is the
 * branch-protection required check. When not eligible the job fails (red X)
 * with a step summary explaining why; when eligible it succeeds (green).
 * No Checks API calls needed.
 */

import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';

import { getRepoContext } from '../shared/actions-context';
import {
  BARE_HOLD_LABEL,
  DO_NOT_MERGE_HOLD_LABEL,
  E2E_HOLD_LABEL,
  NEEDS_REBASE_LABEL,
  getMergePoolBlockers,
} from '../shared/merge-pool';
import { addStepSummary, failStep } from '../shared/output';
import { requireEnv } from '../utils';

type Reason = { short: string; long: string };

const describeBlockingLabel = (label: string): Reason => {
  if (label === E2E_HOLD_LABEL) {
    return {
      short: 'held via /hold-e2e',
      long: 'Hot Cluster E2E is on hold. Comment `/retest-e2e` to lift the hold and get a fresh result.',
    };
  }
  if (label === BARE_HOLD_LABEL || label === DO_NOT_MERGE_HOLD_LABEL) {
    return { short: 'held via /hold', long: 'Comment `/hold cancel` to lift the hold.' };
  }
  if (label === NEEDS_REBASE_LABEL) {
    return { short: 'needs-rebase', long: 'Update this PR with the latest base branch changes.' };
  }
  return { short: `blocked by \`${label}\``, long: `Resolve and clear the \`${label}\` label.` };
};

const describeEligibility = (
  missingLgtm: boolean,
  missingApproved: boolean,
  blockingLabels: string[],
): Reason[] => {
  const reasons: Reason[] = [];
  if (missingLgtm) {
    reasons.push({
      short: 'missing lgtm',
      long: 'Comment `/lgtm` (any collaborator), or get a native GitHub Approve review.',
    });
  }
  if (missingApproved) {
    reasons.push({
      short: 'missing approved',
      long: 'Comment `/approve` (root OWNERS), or get a native GitHub Approve review from an OWNERS approver.',
    });
  }
  for (const label of blockingLabels) {
    reasons.push(describeBlockingLabel(label));
  }
  return reasons;
};

const main = async (): Promise<void> => {
  const token = requireEnv('GITHUB_TOKEN');
  const botToken = process.env.BOT_TOKEN || token;
  const { owner, repo } = getRepoContext();
  const prNumber = Number(requireEnv('PR_NUMBER'));
  const octokit = new Octokit({ auth: token });

  let eligible: boolean;
  let nodeId = '';
  let determined = true;
  let reasons: Reason[] = [];

  try {
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
    const blockers = getMergePoolBlockers(pr.labels);
    eligible =
      !blockers.missingLgtm && !blockers.missingApproved && blockers.blockingLabels.length === 0;
    reasons = describeEligibility(
      blockers.missingLgtm,
      blockers.missingApproved,
      blockers.blockingLabels,
    );
    nodeId = pr.node_id;
    console.log(
      `PR #${prNumber} labels: [${pr.labels.map((l) => l.name).join(', ')}] -- merge-pool eligible: ${eligible}`,
    );
  } catch (err) {
    determined = false;
    eligible = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `Could not determine merge-pool eligibility for PR #${prNumber}: ${msg} -- failing closed.`,
    );
  }

  // Write a step summary so the details are visible inline in the Actions UI.
  if (!determined) {
    addStepSummary(
      '## Merge Gate\n\n' +
        ':warning: Could not determine eligibility — failed to read PR labels. ' +
        'Failing closed until a later event retries.',
    );
  } else if (eligible) {
    addStepSummary(
      '## Merge Gate\n\n' +
        ':white_check_mark: **Merge-pool eligible** — PR carries `lgtm` + `approved` with no blocking labels.',
    );
  } else {
    const lines = reasons.map((r) => `- **${r.short}** — ${r.long}`);
    addStepSummary(
      '## Merge Gate\n\n' +
        ':x: **Not eligible for merge**\n\n' +
        lines.join('\n'),
    );
  }

  // Toggle auto-merge via GraphQL
  if (determined && nodeId) {
    const gql = graphql.defaults({ headers: { authorization: `token ${botToken}` } });

    if (eligible) {
      try {
        await gql(
          `mutation($id: ID!) {
            enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: MERGE }) {
              pullRequest { autoMergeRequest { enabledAt } }
            }
          }`,
          { id: nodeId },
        );
        console.log(`Enabled auto-merge for PR #${prNumber}.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Could not enable auto-merge for PR #${prNumber}: ${msg}`);
      }
    } else {
      try {
        await gql(
          `mutation($id: ID!) {
            disablePullRequestAutoMerge(input: { pullRequestId: $id }) {
              pullRequest { autoMergeRequest { enabledAt } }
            }
          }`,
          { id: nodeId },
        );
        console.log(`Disabled auto-merge for PR #${prNumber} (not merge-pool eligible).`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`No auto-merge to disable for PR #${prNumber} (${msg}).`);
      }
    }
  }

  // Fail the job when not eligible — the native job check is the branch-protection gate.
  if (!eligible) {
    const short = reasons.map((r) => r.short).join(', ');
    failStep(`Not eligible: ${short || 'could not determine eligibility'}`);
  }
};

main().catch((err) => {
  failStep(err instanceof Error ? err.message : String(err));
});
