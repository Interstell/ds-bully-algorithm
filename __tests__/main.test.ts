import { start } from '../src/main';

describe('start function', () => {
  // Assert if no errors occured
  // eslint-disable-next-line jest/expect-expect
  beforeAll(() => {
    process.argv[2] = '../build/src/processes.csv';
  });

  // eslint-disable-next-line jest/expect-expect
  it('starts', () => {
    start();
  });
});
