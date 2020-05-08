import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';
import * as minimist from 'minimist';
import * as inquirer from 'inquirer';
import { Table } from 'console-table-printer';

import { ProcessFileRecord } from './System.types';
import Process from './Process';
import logger, { setLoggingLevel } from './logger';
import { LoggingLevel } from './logger.types';

const UI_TIME_TO_WAIT_FOR_VICTORY = 7000; // ms

export class System {
  processes: Process[];

  readProcessesFile = (): ProcessFileRecord[] => {
    const argv = minimist(process.argv.slice(2));
    const processesFileName = argv['_'][0];
    if (!processesFileName) {
      logger.error('Please, pass processes_file filename as the first argument');
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
        .map((line) => line.split(','))
        .map(([id, fullName]) => {
          return {
            id: Number(id.trim()),
            fullName: fullName.trim(),
          };
        });
    } catch (e) {
      logger.error(`Error occured when parsing ${processesFileName}: something went wrong.`);
      process.exit(1);
    }
  };

  createProcesses = (processFileRecords: ProcessFileRecord[]): Process[] => {
    return processFileRecords.map(({ id, fullName }) => {
      const [shortName, counter] = fullName.split('_');
      if (!shortName || !counter) {
        logger.error(`Error occurred when parsing process records: something went wrong.`);
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
        choices: ['list', 'kill', 'reload', 'test', 'exit'],
      },
    ]);
    switch (answer) {
      case 'list':
        this.listProcesses();
        break;
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
        if (!this.processes.some((pr) => pr.id === pid)) {
          logger.error(
            `Process with PID ${pid} does not exist. Run 'list' command to see the PIDs of running processes.`,
          );
          break;
        }
        await this.killProcess(pid);
        break;
      }
      case 'reload':
        await this.reload();
        break;
      case 'test':
        const { nr_of_nodes } = await inquirer.prompt([
          {
            type: 'number',
            name: 'nr_of_nodes',
            message: '>> Enter the numbers of nodes you want to see in the election testing:',
            filter: Number,
          },
        ]);
        if (isNaN(nr_of_nodes)) {
          logger.error('Nr of nodes should be a number');
          break;
        }
        if (nr_of_nodes < 0) {
          logger.error(`Nr of nodes needs to be positive. ${nr_of_nodes} is not positive`);
          break;
        }
        const base_line_ms = await this.test(5);
        const test_line_ms = await this.test(nr_of_nodes);
        logger.info('It took ' + base_line_ms + ' ms to complete the election with 5 nodes and ' + test_line_ms + ' ms with ' + nr_of_nodes + ' nodes.');
        break;
      case 'exit':
        process.exit(0);
        break;
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
    this.processes.forEach((p) => {
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
    const process = this.processes.find((p) => p.id === pid);
    if (process.isCoordinator()) {
      process.kill();
      setLoggingLevel(LoggingLevel.verbose);
      logger.info(`Process PID ${pid} killed. It was a coordinator, so the election will start soon.`);
      await this.wait(UI_TIME_TO_WAIT_FOR_VICTORY);
      setLoggingLevel(LoggingLevel.info);
    } else {
      logger.info(`Process PID ${pid} killed. It was NOT a coordinator, so the election will NOT happen.`);
    }
    this.processes = this.processes.filter((p) => p !== process);
  };

  reload = async (): Promise<void> => {
    const reloadedProcessRecords = this.readProcessesFile();
    const newRecords: ProcessFileRecord[] = _.differenceBy(reloadedProcessRecords, this.processes, (p) => p.id);

    if (newRecords.length === 0) {
      logger.info('No new processes were read from the processes_file. New election will not happen.');
      return;
    }

    const newProcesses = this.createProcesses(newRecords);
    newProcesses.forEach((p) => (p.counter -= 1));
    this.processes.push(...newProcesses);
    newProcesses.forEach((p) => p.start());

    setLoggingLevel(LoggingLevel.verbose);
    await this.wait(UI_TIME_TO_WAIT_FOR_VICTORY);
    setLoggingLevel(LoggingLevel.info);
  };

  test = async (nr: number): Promise<number> => {
    //Create testable processes
    let processes: ProcessFileRecord[] = [];
    for (let i = 0; i < nr; i++) {
      const new_process = {
        id: i,
        fullName: i.toString()+"_0",
      };
      processes.push(new_process);
    }
    // Record old values
    const old_process = this.processes;
    this.processes = [];

    //Create new processes
    const newProcesses = this.createProcesses(processes);
    newProcesses.forEach((p) => (p.counter -= 1));
    this.processes.push(...newProcesses);
    //Start testing
    const start_time = new Date().getTime();
    newProcesses.forEach((p) => p.start());
    setLoggingLevel(LoggingLevel.info);
    await this.wait(UI_TIME_TO_WAIT_FOR_VICTORY);
    setLoggingLevel(LoggingLevel.info);

    //Stop testing
    const testing_time = new Date().getTime() - start_time;

    //Reset processes
    this.processes = old_process;

    return testing_time;
  };


  wait = async (time = 1000): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, time));
  };

  start(): void {
    const processFileRecords = this.readProcessesFile();
    this.processes = this.createProcesses(processFileRecords);
    this.processes.forEach((p) => p.start());

    this.startUI();
  }

  stop(): void {
    this.processes.forEach((p) => p.kill());
  }
}
