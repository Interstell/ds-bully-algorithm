import * as fs from 'fs';
import * as path from 'path';
import * as minimist from 'minimist';

import Process from './Process';

function readProcessesFile(): ProcessFileRecord[] {
  const argv = minimist(process.argv.slice(2));
  const processesFileName = argv['_'][0];
  if (!processesFileName) {
    console.error(
      'Error: Please, pass processes_file filename as the first argument',
    );
    process.exit(1);
  }

  let fileContents: string;
  try {
    fileContents = fs.readFileSync(path.resolve(__dirname, processesFileName), {
      encoding: 'utf-8',
    });
  } catch (e) {
    console.error(`Error: File ${processesFileName} was not found.`);
    process.exit(1);
  }
  try {
    return fileContents
      .trim()
      .split('\n')
      .map(line => line.split(','))
      .map(([id, fullName]) => {
        return {
          id: Number(id.trim()),
          fullName: fullName.trim(),
        };
      });
  } catch (e) {
    console.error(
      `Error occured when parsing ${processesFileName}: something went wrong.`,
    );
    process.exit(1);
  }
}

export function start(): void {
  const processFileRecords = readProcessesFile();
  const processes = processFileRecords.map(
    ({ id, fullName }) => new Process(id, fullName),
  );
  console.log(processes);
}
