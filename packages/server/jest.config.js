export default {
  testEnvironment: 'node',
  transform: {},
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.bak$',
    'loadtest\\.k6\\.js$',
  ],
};
