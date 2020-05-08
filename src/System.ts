import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';
import * as minimist from 'minimist';
import * as inquirer from 'inquirer';
import { Table } from 'console-table-printer';

import { Message, MessageType, ProcessFileRecord } from './System.types';
import Process from './Process';
import logger, { setLoggingLevel } from './logger';
import { LoggingLevel } from './logger.types';
import MessageBroker, { BROADCAST_EVENT_NAME } from './MessageBroker';

const UI_MAX_TIME_TO_WAIT_FOR_VICTORY = 10000; // ms

export class System {
  processes: Process[];

  readProcessesFile = (): ProcessFileRecord[] => {
    const argv = minimist(process.argv.slice(2));
    const processesFileName = argv['_'][0];
    if (!processesFileName) {
      logger.error(
        'Please, pass processes_file filename as the first argument',
      );
      process.exit(1);
    }

    let fileContents: string;
    try {
      fileContents = fs.readFileSync(path.resolve('', processesFileName), {
        encoding: 'utf-8',
      });
    } catch (e) {
      logger.error(`File ${processesFileName} was not found.`);
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
      logger.error(
        `Error occured when parsing ${processesFileName}: something went wrong.`,
      );
      process.exit(1);
    }
  };

  createProcesses = (processFileRecords: ProcessFileRecord[]): Process[] => {
    return processFileRecords.map(({ id, fullName }) => {
      const [shortName, counter] = fullName.split('_');
      if (!shortName || !counter) {
        logger.error(
          `Error occurred when parsing process records: something went wrong.`,
        );
        process.exit(1);
      }
      return new Process(id, shortName, Number(counter));
    });
  };

  startUI = async (): Promise<void> => {
    const { main: answer } = await inquirer.prompt([
      {
        type: 'list',
        name: 'main',
        message: '> Enter your command:',
        choices: ['list', 'kill', 'reload', 'benchmark', 'exit'],
      },
    ]);
    switch (answer) {
      case 'list': {
        this.listProcesses();
        break;
      }

      case 'kill': {
        const { pid } = await inquirer.prompt([
          {
            type: 'number',
            name: 'pid',
            message: '>> Enter process id (PID) to kill:',
            filter: Number,
          },
        ]);
        if (isNaN(pid)) {
          logger.error('PID is not a number. Try again.');
          break;
        }
        if (!this.processes.some(pr => pr.id === pid)) {
          logger.error(
            `Process with PID ${pid} does not exist. Run 'list' command to see the PIDs of running processes.`,
          );
          break;
        }
        await this.killProcess(pid);
        break;
      }

      case 'reload': {
        await this.reload();
        break;
      }

      case 'benchmark': {
        await this.benchmark();
        break;
      }

      case 'exit': {
        process.exit(0);
        break;
      }
    }
    setImmediate(this.startUI);
  };

  listProcesses = (): void => {
    const table = new Table({
      columns: [
        { name: 'id', alignment: 'left', color: 'red' },
        { name: 'name', alignment: 'right' },
        { name: 'Is Coordinator', alignment: 'center' },
        { name: 'State', alignment: 'right' },
        { name: 'Coordinator ID', alignment: 'right' },
      ],
      sort: (row1, row2): number => row1.id - row2.id,
    });
    this.processes.forEach(p => {
      table.addRow(
        {
          id: p.id,
          name: p.name,
          'Is Coordinator': p.isCoordinator() ? '+' : '',
          State: p.state,
          'Coordinator ID': p.coordinatorId,
        },
        p.isCoordinator() ? { color: 'green' } : { color: null },
      );
    });
    table.printTable();
  };

  killProcess = async (pid: number): Promise<void> => {
    const process = this.processes.find(p => p.id === pid);
    if (process.isCoordinator()) {
      process.kill();
      setLoggingLevel(LoggingLevel.verbose);
      logger.info(
        `Process PID ${pid} killed. It was a coordinator, so the election will start soon.`,
      );
      await this.waitForVictoryWithTimeout();
      setLoggingLevel(LoggingLevel.info);
    } else {
      logger.info(
        `Process PID ${pid} killed. It was NOT a coordinator, so the election will NOT happen.`,
      );
    }
    this.processes = this.processes.filter(p => p !== process);
  };

  reload = async (): Promise<void> => {
    const reloadedProcessRecords = this.readProcessesFile();
    const newRecords: ProcessFileRecord[] = _.differenceBy(
      reloadedProcessRecords,
      this.processes,
      p => p.id,
    );

    if (newRecords.length === 0) {
      logger.info(
        'No new processes were found in the processes_file. New election will not happen.',
      );
      return;
    }

    const newProcesses = this.createProcesses(newRecords);
    newProcesses.forEach(p => (p.counter -= 1));
    this.processes.push(...newProcesses);
    newProcesses.forEach(p => p.start());

    logger.info(
      `Reload completed. New processes added: ${newProcesses.length}. Election will start soon.`,
    );

    setLoggingLevel(LoggingLevel.verbose);
    await this.waitForVictoryWithTimeout();
    setLoggingLevel(LoggingLevel.info);
  };

  benchmark = async (): Promise<void> => {
    // pausing current processes
    this.processes.forEach(p => p.kill());

    for (let N = 10; N <= 100; N += 10) {
      // creating N processes
      const processFileRecords: ProcessFileRecord[] = _.times(
        N,
        i =>
          ({
            id: i + 1,
            fullName: `PID${i + 1}_0`,
          } as ProcessFileRecord),
      );
      const processes = this.createProcesses(processFileRecords);

      // measuring time
      const label = `Election time for ${N} processes`;
      console.time(label);

      processes.forEach(p => p.start());
      await this.waitForVictory();

      console.timeEnd(label);

      // killing created processes
      await this.wait(2000);
      processes.forEach(p => p.kill());
    }

    // returning current processes back to normal
    this.processes.forEach(p => p.start());
    this.processes.forEach(p => (p.counter -= 1));
  };

  wait = async (time = 1000): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, time));
  };

  waitForVictory = async (): Promise<void> => {
    await new Promise(resolve => {
      const cb = (msg: Message): void => {
        if (msg.type === MessageType.Victory) {
          MessageBroker.off(BROADCAST_EVENT_NAME, cb);
          resolve();
        }
      };
      MessageBroker.on(BROADCAST_EVENT_NAME, cb);
    });
  };

  waitForVictoryWithTimeout = async (
    timeout = UI_MAX_TIME_TO_WAIT_FOR_VICTORY,
  ): Promise<void> => {
    return Promise.race([this.waitForVictory(), this.wait(timeout)]);
  };

  start(): void {
    const processFileRecords = this.readProcessesFile();
    this.processes = this.createProcesses(processFileRecords);
    this.processes.forEach(p => p.start());

    this.startUI();
  }

  stop(): void {
    this.processes.forEach(p => p.kill());
  }
}
