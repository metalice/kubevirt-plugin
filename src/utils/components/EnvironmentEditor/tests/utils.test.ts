import { EnvironmentKind, EnvironmentVariable } from '../constants';
import { areEnvironmentsChanged } from '../utils';

const env1Name = 'test-1';
const env1Serial = '1234';

const env2Name = 'test-2';
const env2Serial = '4321';

describe('utils tests', () => {
  describe('areEnvironmentsChanged tests', () => {
    it('shuffle Envs', () => {
      const initialEnvironments: EnvironmentVariable[] = [
        { name: env1Name, kind: EnvironmentKind.secret, serial: env1Serial },
        { name: env2Name, kind: EnvironmentKind.secret, serial: env2Serial },
      ];
      const newEnvironment: EnvironmentVariable[] = [
        { name: env2Name, kind: EnvironmentKind.secret, serial: env2Serial },
        { name: env1Name, kind: EnvironmentKind.secret, serial: env1Serial },
      ];
      expect(areEnvironmentsChanged(newEnvironment, initialEnvironments)).toBeFalsy();
    });

    it('added Env', () => {
      const initialEnvironments: EnvironmentVariable[] = [
        { name: env2Name, kind: EnvironmentKind.secret, serial: env2Serial },
      ];
      const newEnvironment: EnvironmentVariable[] = [
        { name: env2Name, kind: EnvironmentKind.secret, serial: env2Serial },
        { name: env1Name, kind: EnvironmentKind.secret, serial: env1Serial },
      ];

      expect(areEnvironmentsChanged(newEnvironment, initialEnvironments)).toBeTruthy();
    });

    it('Removed Env', () => {
      const newEnvironment: EnvironmentVariable[] = [
        { name: env2Name, kind: EnvironmentKind.secret, serial: env2Serial },
      ];
      const initialEnvironments: EnvironmentVariable[] = [
        { name: env2Name, kind: EnvironmentKind.secret, serial: env2Serial },
        { name: env1Name, kind: EnvironmentKind.secret, serial: env1Serial },
      ];

      expect(areEnvironmentsChanged(newEnvironment, initialEnvironments)).toBeTruthy();
    });
  });
});