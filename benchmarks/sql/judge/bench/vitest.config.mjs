// Config propia para ejecutar solo __bench__ (ignora la config del modelo).
export default {
  test: {
    include: ['__bench__/**/*.test.ts'],
    testTimeout: 60_000,
    pool: 'forks',
  },
};
