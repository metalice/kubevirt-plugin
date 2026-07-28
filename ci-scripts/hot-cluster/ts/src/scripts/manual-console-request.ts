/**
 * Create/update a ci-env-controller trigger ConfigMap for the manual
 * console environment and wait for it to become ready.
 *
 * Required env: CM_NAME, CM_NS, PLUGIN_IMAGE, TEST_NS, HELM_RELEASE,
 *               HTPASSWD_USER, HTPASSWD_SECRET_NAME, TIMEOUT
 *
 * Outputs: bridge-base-address, console-route
 */

import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { waitForConfigMapStatus } from '../ci-env-poll';
import { requireEnv } from '../kube-client';

const cmName = requireEnv('CM_NAME');
const cmNs = requireEnv('CM_NS');
const pluginImage = requireEnv('PLUGIN_IMAGE');
const testNs = requireEnv('TEST_NS');
const helmRelease = process.env.HELM_RELEASE || cmName;
const htpasswdUser = requireEnv('HTPASSWD_USER');
const htpasswdSecretName = requireEnv('HTPASSWD_SECRET_NAME');
const timeout = Number(requireEnv('TIMEOUT'));

const manifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${cmName}
  namespace: ${cmNs}
  labels:
    ci.kubevirt-plugin/type: manual-console
data:
  desired-state: "present"
  plugin-image: "${pluginImage}"
  test-namespace: "${testNs}"
  helm-release: "${helmRelease}"
  auth-mode: "openshift"
  htpasswd-user: "${htpasswdUser}"
  htpasswd-secret-name: "${htpasswdSecretName}"
`.trim();

execSync(`echo '${manifest}' | oc apply -f -`, { stdio: 'inherit' });
console.log(`Created/updated trigger ConfigMap ${cmName} in ${cmNs}`);

execSync(
  `oc patch configmap ${cmName} -n ${cmNs} --type merge -p '{"data":{"status":"pending","error-message":null}}'`,
  { stdio: 'inherit' },
);
console.log('Reset status=pending so ci-env-controller re-provisions on this dispatch');

const main = async (): Promise<void> => {
  const result = await waitForConfigMapStatus({
    name: cmName,
    namespace: cmNs,
    targetStatus: 'ready',
    timeoutSeconds: timeout,
    label: 'manual console environment',
  });

  const output = process.env.GITHUB_OUTPUT!;
  appendFileSync(output, `bridge-base-address=${result.data['bridge-base-address']}\n`);
  appendFileSync(output, `console-route=${result.data['console-route']}\n`);

  const summary = process.env.GITHUB_STEP_SUMMARY!;
  appendFileSync(
    summary,
    [
      '<details><summary>Manual Console Environment</summary>',
      '',
      '| Input Parameter | Value |',
      '|------|-------|',
      `| ConfigMap | \`${cmNs}/${cmName}\` |`,
      `| Helm release | \`${helmRelease}\` |`,
      `| Plugin image | \`${pluginImage}\` |`,
      `| Namespace | \`${testNs}\` |`,
      `| Login username | \`${htpasswdUser}\` |`,
      '',
      '| Output Parameter | Value |',
      '|------|-------|',
      `| Console route | \`${result.data['console-route']}\` |`,
      '',
      '</details>',
      '',
    ].join('\n'),
  );
};

main().catch((err) => {
  console.error(`::error::${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
