export default {
  testEnvironment: 'node',
  transform: {},   // pure ESM — no Babel needed with Node 20 + --experimental-vm-modules
  extensionsToTreatAsEsm: ['.js'],
};