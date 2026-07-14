import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.test\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@arp/shared$': '<rootDir>/../../packages/shared/src',
    '^@arp/types$': '<rootDir>/../../packages/types/src',
    '^@arp/prompts$': '<rootDir>/../../packages/prompts/src',
  },
};

export default config;
