import DataSourceModel from '@kubevirt-ui/kubevirt-api/console/models/DataSourceModel';
import VirtualMachineInstancetypeModel from '@kubevirt-ui/kubevirt-api/console/models/VirtualMachineInstancetypeModel';
import VirtualMachineModel from '@kubevirt-ui/kubevirt-api/console/models/VirtualMachineModel';
import { V1VirtualMachine } from '@kubevirt-ui/kubevirt-api/kubevirt';
import {
  addCloudInitUpdateCMD,
  CloudInitUserData,
  convertUserDataObjectToYAML,
} from '@kubevirt-utils/components/CloudinitModal/utils/cloudinit-utils';
import { ACTIVATION_KEY } from '@kubevirt-utils/components/CloudinitModal/utils/constants';
import { addSecretToVM } from '@kubevirt-utils/components/SSHSecretModal/utils/utils';
import { sysprepDisk, sysprepVolume } from '@kubevirt-utils/components/SysprepModal/sysprep-utils';
import { ROOTDISK } from '@kubevirt-utils/constants/constants';
import { RHELAutomaticSubscriptionData } from '@kubevirt-utils/hooks/useRHELAutomaticSubscription/utils/types';
import { isBootableVolumePVCKind } from '@kubevirt-utils/resources/bootableresources/helpers';
import { getLabel, getName, getNamespace } from '@kubevirt-utils/resources/shared';
import { OS_NAME_TYPES, OS_NAME_TYPES_NOT_SUPPORTED } from '@kubevirt-utils/resources/template';
import {
  DEFAULT_NETWORK,
  DEFAULT_NETWORK_INTERFACE,
} from '@kubevirt-utils/resources/vm/utils/constants';
import { OS_WINDOWS_PREFIX } from '@kubevirt-utils/resources/vm/utils/operation-system/operationSystem';
import {
  HEADLESS_SERVICE_LABEL,
  HEADLESS_SERVICE_NAME,
} from '@kubevirt-utils/utils/headless-service';
import { generatePrettyName, getRandomChars, isEmpty } from '@kubevirt-utils/utils/utils';
import { K8sGroupVersionKind, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

import { useInstanceTypeVMStore } from '../state/useInstanceTypeVMStore';
import { InstanceTypeVMState } from '../state/utils/types';

import {
  DEFAULT_INSTANCETYPE_LABEL,
  DEFAULT_PREFERENCE_KIND_LABEL,
  DEFAULT_PREFERENCE_LABEL,
  KUBEVIRT_OS,
} from './constants';

const generateCloudInitPassword = () =>
  `${getRandomChars(4)}-${getRandomChars(4)}-${getRandomChars(4)}`;

const getCloudInitUserNameByOS = (selectedPreferenceName: string, osLabel: string): string => {
  for (const name in [
    ...Object.values(OS_NAME_TYPES),
    ...Object.values(OS_NAME_TYPES_NOT_SUPPORTED),
  ]) {
    if (selectedPreferenceName?.includes(name) || osLabel?.includes(name)) return name;
  }
  return 'cloud-user';
};

export const createPopulatedCloudInitYAML = (
  selectedPreference: string,
  osLabel: string,
  subscriptionData: RHELAutomaticSubscriptionData,
  autoUpdateEnabled?: boolean,
) => {
  const { activationKey, organizationID } = subscriptionData;

  const cloudInitConfig: CloudInitUserData = {
    chpasswd: { expire: false },
    password: generateCloudInitPassword(),
    user: getCloudInitUserNameByOS(selectedPreference, osLabel),
  };

  const isRHELVM = selectedPreference.includes(OS_NAME_TYPES.rhel);

  if (isRHELVM && !isEmpty(activationKey) && !isEmpty(organizationID)) {
    cloudInitConfig.rh_subscription = { [ACTIVATION_KEY]: activationKey, org: organizationID };

    if (autoUpdateEnabled) {
      addCloudInitUpdateCMD(cloudInitConfig);
    }
  }

  return convertUserDataObjectToYAML(cloudInitConfig, true);
};

export const generateVM = (
  instanceTypeState: InstanceTypeVMState,
  targetNamespace: string,
  startVM: boolean,
  subscriptionData: RHELAutomaticSubscriptionData,
  autoUpdateEnabled?: boolean,
) => {
  const {
    pvcSource,
    selectedBootableVolume,
    selectedInstanceType,
    sshSecretCredentials,
    sysprepConfigMapData,
    vmName,
  } = instanceTypeState;
  const { sshSecretName } = sshSecretCredentials;
  const virtualmachineName = vmName ?? generatePrettyName();

  const sourcePVC = {
    name: getName(selectedBootableVolume),
    namespace: getNamespace(selectedBootableVolume),
  };

  const selectedPreference = getLabel(selectedBootableVolume, DEFAULT_PREFERENCE_LABEL);
  const osLabel = getLabel(selectedBootableVolume, KUBEVIRT_OS);
  const selectPreferenceKind = getLabel(
    selectedBootableVolume,
    DEFAULT_PREFERENCE_KIND_LABEL,
    null,
  );
  const isDynamic = instanceTypeState?.isDynamicSSHInjection;
  const isSysprep = !isEmpty(sysprepConfigMapData?.name);

  const emptyVM: V1VirtualMachine = {
    apiVersion: `${VirtualMachineModel.apiGroup}/${VirtualMachineModel.apiVersion}`,
    kind: VirtualMachineModel.kind,
    metadata: {
      name: virtualmachineName,
      namespace: targetNamespace,
    },
    spec: {
      dataVolumeTemplates: [
        {
          metadata: {
            name: `${virtualmachineName}-volume`,
          },
          spec: {
            ...(isBootableVolumePVCKind(selectedBootableVolume)
              ? {
                  source: {
                    pvc: { ...sourcePVC },
                  },
                }
              : {
                  sourceRef: {
                    kind: DataSourceModel.kind,
                    ...sourcePVC,
                  },
                }),
            storage: {
              resources: {},
              storageClassName:
                instanceTypeState.selectedStorageClass || pvcSource?.spec?.storageClassName,
            },
          },
        },
      ],
      instancetype: {
        ...(instanceTypeState?.selectedInstanceType?.namespace && {
          kind: VirtualMachineInstancetypeModel.kind,
        }),
        name:
          selectedInstanceType?.name ||
          selectedBootableVolume?.metadata?.labels?.[DEFAULT_INSTANCETYPE_LABEL],
      },
      preference: {
        name: selectedPreference,
        ...(selectPreferenceKind && { kind: selectPreferenceKind }),
      },
      running: startVM,
      template: {
        metadata: {
          labels: {
            [HEADLESS_SERVICE_LABEL]: HEADLESS_SERVICE_NAME,
          },
        },
        spec: {
          domain: {
            devices: {
              autoattachPodInterface: false,
              interfaces: [DEFAULT_NETWORK_INTERFACE],
              ...(isSysprep ? { disks: [sysprepDisk()] } : {}),
            },
          },
          networks: [DEFAULT_NETWORK],
          subdomain: HEADLESS_SERVICE_NAME,
          volumes: [
            {
              dataVolume: { name: `${virtualmachineName}-volume` },
              name: ROOTDISK,
            },
            isSysprep
              ? sysprepVolume(sysprepConfigMapData?.name)
              : {
                  cloudInitNoCloud: {
                    userData: createPopulatedCloudInitYAML(
                      selectedPreference,
                      osLabel,
                      subscriptionData,
                      autoUpdateEnabled,
                    ),
                  },
                  name: 'cloudinitdisk',
                },
          ],
        },
      },
    },
  };

  if (instanceTypeState.customDiskSize) {
    emptyVM.spec.dataVolumeTemplates[0].spec.storage.resources = {
      requests: {
        storage: instanceTypeState.customDiskSize,
      },
    };
  }

  return sshSecretName ? addSecretToVM(emptyVM, sshSecretName, isDynamic) : emptyVM;
};

export const groupVersionKindFromCommonResource = (
  resource: K8sResourceCommon,
): K8sGroupVersionKind => {
  const [group, version] = resource.apiVersion.split('/');
  const kind = resource.kind;
  return { group, kind, version };
};

export const useIsWindowsBootableVolume = (): boolean => {
  const { instanceTypeVMState } = useInstanceTypeVMStore();
  const { selectedBootableVolume } = instanceTypeVMState;
  const defaultPreferenceName = getLabel(selectedBootableVolume, DEFAULT_PREFERENCE_LABEL);

  return defaultPreferenceName?.startsWith(OS_WINDOWS_PREFIX);
};
