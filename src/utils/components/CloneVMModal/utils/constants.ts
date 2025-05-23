import { ProgressStepVariant } from '@patternfly/react-core';

export const TEMPLATE_VM_NAME_LABEL = 'vm.kubevirt.io/name';

export enum CLONING_STATUSES {
  CREATING_TARGET_VM = 'CreatingTargetVM',
  FAILED = 'Failed',
  RESTORE_IN_PROGRESS = 'RestoreInProgress',
  SNAPSHOT_IN_PROGRESS = 'SnapshotInProgress',
  SUCCEEDED = 'Succeeded',
  UNKNOWN = 'Unknown',
}

export const STATUS_TO_PROGRESS_VARIANT = {
  CreatingTargetVM: ProgressStepVariant.info,
  Failed: ProgressStepVariant.danger,
  RestoreInProgress: ProgressStepVariant.info,
  SnapshotInProgress: ProgressStepVariant.info,
  Succeeded: ProgressStepVariant.success,
  Unknown: ProgressStepVariant.danger,
};
