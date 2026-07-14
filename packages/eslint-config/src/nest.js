/** ESLint config for NestJS apps */
module.exports = {
  extends: ['./index.js'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    'no-console': 'off',
  },
};
