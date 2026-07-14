/** ESLint config for Node.js services (crawler, extractor, etc.) */
module.exports = {
  extends: ['./index.js'],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    'no-console': 'off',
  },
};
