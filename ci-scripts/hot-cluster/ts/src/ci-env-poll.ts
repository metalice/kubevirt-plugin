/**
 * Shared poll helper for ci-env-controller trigger ConfigMaps.
 * Used by ci-env-request and manual-console-request to wait until
 * the controller provisions the environment (status=ready) or
 * reports an error (status=error).
 */

import { execSync } from 'node:child_process';

export type PollResult = {
  status: string;
  data: Record<string, string>;
};

const getConfigMapField = (name: string, namespace: string, field: string): string => {
  try {
    return execSync(`oc get configmap "${name}" -n "${namespace}" -o jsonpath='{.data.${field}}'`, {
      encoding: 'utf8',
    }).replace(/^'|'$/g, '');
  } catch {
    return '';
  }
};

/**
 * Poll a trigger ConfigMap until its status reaches a target value or times out.
 */
export const waitForConfigMapStatus = async (params: {
  name: string;
  namespace: string;
  targetStatus: string;
  timeoutSeconds: number;
  intervalSeconds?: number;
  label?: string;
}): Promise<PollResult> => {
  const { name, namespace, targetStatus, timeoutSeconds, label = 'environment' } = params;
  const interval = params.intervalSeconds ?? 10;

  console.log(`Waiting for ci-env-controller to provision the ${label}...`);
  let elapsed = 0;

  while (true) {
    const status = getConfigMapField(name, namespace, 'status');

    if (status === targetStatus) {
      console.log(`${label} is ${targetStatus}.`);
      const data: Record<string, string> = {};
      for (const field of ['bridge-base-address', 'console-route']) {
        data[field] = getConfigMapField(name, namespace, field);
      }
      return { status, data };
    }

    if (status === 'error') {
      const errMsg = getConfigMapField(name, namespace, 'error-message') || 'unknown error';
      throw new Error(`${label} provisioning failed: ${errMsg}`);
    }

    if (elapsed >= timeoutSeconds) {
      throw new Error(`Timed out waiting for ${label} (status=${status || 'pending'})`);
    }

    console.log(`  status=${status || 'pending'} (${elapsed}s / ${timeoutSeconds}s)...`);
    await new Promise((r) => setTimeout(r, interval * 1000));
    elapsed += interval;
  }
};

/**
 * Poll a trigger ConfigMap until cleanup completes (status=cleaned) or times out.
 */
export const waitForCleanup = async (params: {
  name: string;
  namespace: string;
  timeoutSeconds: number;
  intervalSeconds?: number;
}): Promise<void> => {
  const { name, namespace, timeoutSeconds } = params;
  const interval = params.intervalSeconds ?? 5;

  console.log('Waiting for controller to clean up...');
  let elapsed = 0;

  while (true) {
    const status = getConfigMapField(name, namespace, 'status');

    if (status === 'cleaned') {
      console.log('Cleanup complete.');
      return;
    }

    if (elapsed >= timeoutSeconds) {
      console.warn(`::warning::Timed out waiting for controller cleanup (status=${status})`);
      return;
    }

    await new Promise((r) => setTimeout(r, interval * 1000));
    elapsed += interval;
  }
};
