import * as fs from 'fs';
import * as path from 'path';
import * as minimist from 'minimist';

import { ProcessFileRecord } from './System.types';
import Process from './Process';

export class System {
  processes: Process[];

  readProcessesFile = (): ProcessFileRecord[] => {
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
      fileContents = fs.readFileSync(path.resolve('', processesFileName), {
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
  };

  createProcesses = (processFileRecords: ProcessFileRecord[]): Process[] => {
    return processFileRecords.map(({ id, fullName }) => {
      const [shortName, counter] = fullName.split('_');
      if (!shortName || !counter) {
        console.error(
          `Error occurred when parsing process records: something went wrong.`,
        );
        process.exit(1);
      }
      return new Process(id, shortName, Number(counter));
    });
  };

  start(): void {
    const processFileRecords = this.readProcessesFile();
    this.processes = this.createProcesses(processFileRecords);

    // imitating killing process with id 5
    setTimeout(() => {
      this.processes[4].kill();
    }, 5000);

    // imitating killing process with id 4
    setTimeout(() => {
      this.processes[2].kill();
    }, 10000);

    // imitating killing process with id 3
    setTimeout(() => {
      this.processes[3].kill();
    }, 15000);

    setTimeout(() => {
      this.processes.forEach(p => p.log());
    }, 20000);
  }

  stop(): void {
    this.processes.forEach(p => p.kill());
  }
}
