import { useMemo } from 'react';

import { modelToGroupVersionKind, SecretModel } from '@kubevirt-ui/kubevirt-api/console';
import { IoK8sApiCoreV1Secret } from '@kubevirt-ui/kubevirt-api/kubernetes';
import { ALL_NAMESPACES_SESSION_KEY } from '@kubevirt-utils/hooks/constants';
import { isEmpty, validateSSHPublicKey } from '@kubevirt-utils/utils/utils';
import { useK8sWatchResource, WatchK8sResult } from '@openshift-console/dynamic-plugin-sdk';

import { SecretSelectionOption, SSHSecretDetails } from '../utils/types';
import { validateSecretNameLength, validateSecretNameUnique } from '../utils/utils';

type UseSecretsData = (
  sshDetails: SSHSecretDetails,
  namespace: string,
) => {
  isDisabled: boolean;
  secretsData: WatchK8sResult<IoK8sApiCoreV1Secret[]>;
};

const useSecretsData: UseSecretsData = (sshDetails, namespace) => {
  const [secrets, ...loadedAndErrorData] = useK8sWatchResource<IoK8sApiCoreV1Secret[]>({
    groupVersionKind: modelToGroupVersionKind(SecretModel),
    isList: true,
    ...(namespace !== ALL_NAMESPACES_SESSION_KEY && {
      namespace,
    }),
    limit: 10000,
  });

  const isDisabled = useMemo(() => {
    const { secretOption, sshPubKey, sshSecretName } = sshDetails;
    return (
      (secretOption === SecretSelectionOption.useExisting && isEmpty(sshSecretName)) ||
      (secretOption === SecretSelectionOption.addNew &&
        (isEmpty(sshPubKey) ||
          isEmpty(sshSecretName) ||
          !validateSSHPublicKey(sshPubKey) ||
          !validateSecretNameUnique(sshSecretName, secrets) ||
          !validateSecretNameLength(sshSecretName)))
    );
  }, [secrets, sshDetails]);

  return {
    isDisabled,
    secretsData: [secrets, ...loadedAndErrorData],
  };
};

export default useSecretsData;