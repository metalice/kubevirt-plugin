/**
 * Resolve a PR's current head SHA, mergeability, CI trust, and
 * merge-pool membership. Used by the pr_number retest path
 * (dispatched by on-main-push.yml after main advances, or
 * /retest-e2e's fallback dispatch).
 *
 * Required env: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER
 * Optional env: SKIP_POOL_CHECK
 *
 * Outputs: head_sha, mergeable, still_in_pool, trusted
 */

import { Octokit } from '@octokit/rest';

import { requireEnv } from '../utils';
import { getRepoContext } from '../shared/actions-context';
import { isListedInLocalOwners } from '../shared/owners';
import { isMergePoolPr } from '../shared/merge-pool';
import { setOutput, failStep } from '../shared/output';

const main = async (): Promise<void> => {
  const octokit = new Octokit({ auth: requireEnv('GITHUB_TOKEN') });
  const { owner, repo } = getRepoContext();
  const prNumber = Number(requireEnv('PR_NUMBER'));
  const skipPoolCheck = process.env.SKIP_POOL_CHECK === 'true';

  let pr: Awaited<ReturnType<typeof octokit.pulls.get>>['data'];

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
    pr = data;
    if (pr.mergeable !== null) break;
    console.log(`PR #${prNumber} mergeable state not yet computed, retrying...`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  const author = pr!.user!.login;
  const ownedByAuthor = isListedInLocalOwners(author);

  const sameRepo = pr!.head.repo?.full_name === pr!.base.repo.full_name;
  const hasOkToTest = pr!.labels.some((label) => label.name === 'ok-to-test');
  const trusted = ownedByAuthor || sameRepo || hasOkToTest;

  const stillInPool = skipPoolCheck || isMergePoolPr(pr!.labels);

  console.log(
    `PR #${prNumber}: head=${pr!.head.sha}, mergeable=${pr!.mergeable}, ` +
      `mergeable_state=${pr!.mergeable_state}, still_in_pool=${stillInPool}` +
      `${skipPoolCheck ? ' (pool check skipped)' : ''}`,
  );
  console.log(
    `PR #${prNumber}: author=${author}, ownedByAuthor=${ownedByAuthor}, ` +
      `sameRepo=${sameRepo}, hasOkToTest=${hasOkToTest}, trusted=${trusted}`,
  );

  setOutput('head_sha', pr!.head.sha);
  setOutput('mergeable', pr!.mergeable === false ? 'false' : 'true');
  setOutput('still_in_pool', stillInPool ? 'true' : 'false');
  setOutput('trusted', trusted ? 'true' : 'false');
};

main().catch((err) => {
  failStep(err instanceof Error ? err.message : String(err));
});
