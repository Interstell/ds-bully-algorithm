import { System } from '../src/System';

describe('start function', () => {
  // Assert if no errors occured
  // eslint-disable-next-line jest/expect-expect
  beforeAll(() => {
    process.argv[2] = 'processes.csv';
  });

  // eslint-disable-next-line jest/expect-expect
  it('starts', () => {
    new System();
  });
});
