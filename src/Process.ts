import MessageBroker from './MessageBroker';
import { Message, MessageType } from './System.types';
import { ProcessState } from './Process.types';

const COORDINATOR_PING_INTERVAL = 2000; // ms here and below
const TIME_TO_WAIT_FOR_COORDINATOR_PONG = 1000;
const TIME_TO_WAIT_FOR_ELECTIONS_ALIVE_MESSAGE = 2000;
const TIME_TO_WAIT_FOR_VICTORY = 5000;
const MAX_TIME_TILL_NEW_PROCESS_STARTS_PINGING = 2000;

const BROADCAST_EVENT_NAME = 'GENERAL';

// Implementation reference:
// https://www.geeksforgeeks.org/election-algorithm-and-distributed-processing/
export default class Process {
  public coordinatorId: number = null;
  public state = ProcessState.Idle;
  public pingInterval: NodeJS.Timeout = null;
  public inboxEventName: string;

  constructor(public id: number, public shortName: string, public counter = 0) {
    this.inboxEventName = `MESSAGE-TO-${id}`;
  }

  start(): void {
    MessageBroker.on(this.inboxEventName, this.onMessageReceived);
    MessageBroker.on(BROADCAST_EVENT_NAME, this.onMessageReceived);

    setTimeout(() => {
      this.pingInterval = setInterval(
        this.pingCoordinator,
        COORDINATOR_PING_INTERVAL,
      );
    }, Math.random() * MAX_TIME_TILL_NEW_PROCESS_STARTS_PINGING);
  }

  get name(): string {
    return `${this.shortName}_${Math.max(this.counter, 0)}`;
  }

  isCoordinator(): boolean {
    return this.id === this.coordinatorId;
  }

  onMessageReceived = (msg: Message): void => {
    switch (msg.type) {
      case MessageType.Ping:
        return this.onPingMessageReceived(msg);
      case MessageType.Pong:
        return this.onPongMessageReceived();
      case MessageType.ElectionAnnounced:
        return this.onElectionAnnounceMessageReceived(msg);
      case MessageType.Alive:
        return this.onElectionAliveMessageReceived(msg);
      case MessageType.Victory:
        return this.onElectionVictoryMessageReceived(msg);
    }
  };

  pingCoordinator = (): void => {
    // When the system is started, there's no coordinator yet
    if (this.coordinatorId === null) {
      this.announceElection();
      return;
    }

    // there's no need to ping during elections or ping ourselves
    if (this.state !== ProcessState.Idle || this.id === this.coordinatorId) {
      return;
    }

    // sending PING to the current coordinator
    this.state = ProcessState.WaitingForCoordinatorPong;
    MessageBroker.emit(`MESSAGE-TO-${this.coordinatorId}`, {
      fromId: this.id,
      toId: this.coordinatorId,
      type: MessageType.Ping,
    } as Message);

    setTimeout(() => {
      // 1. If coordinator does not respond to it within a time interval T,
      // then it is assumed that coordinator has failed.
      if (this.state === ProcessState.WaitingForCoordinatorPong) {
        this.announceElection();
      }
    }, TIME_TO_WAIT_FOR_COORDINATOR_PONG);
  };

  onPingMessageReceived = (msg: Message): void => {
    // sending PONG back
    MessageBroker.emit(`MESSAGE-TO-${msg.fromId}`, {
      fromId: this.id,
      toId: msg.fromId,
      type: MessageType.Pong,
    } as Message);
  };

  onPongMessageReceived = (): void => {
    if (this.state == ProcessState.WaitingForCoordinatorPong) {
      this.state = ProcessState.Idle;
    }
  };

  announceElection = (): void => {
    this.state = ProcessState.WaitingForElectionsAlive;
    // 2. Now process P sends election message to every process
    // with high priority number.
    MessageBroker.emit(BROADCAST_EVENT_NAME, {
      fromId: this.id,
      type: MessageType.ElectionAnnounced,
    } as Message);

    setTimeout(() => {
      // 3. It waits for responses, if no one responds for time interval T
      // then process P elects itself as a coordinator.
      if (this.state === ProcessState.WaitingForElectionsAlive) {
        this.announceMyselfAsACoordinator();
      }
    }, TIME_TO_WAIT_FOR_ELECTIONS_ALIVE_MESSAGE);
  };

  onElectionAnnounceMessageReceived = (msg: Message): void => {
    // 5. However, if an answer is received within time T from any other process Q
    if (this.id > msg.fromId) {
      MessageBroker.emit(BROADCAST_EVENT_NAME, {
        fromId: this.id,
        type: MessageType.Alive,
      } as Message);
      if (this.state == ProcessState.Idle || this.state == ProcessState.WaitingForCoordinatorPong) {
        this.announceElection();
      }
    }
  };

  onElectionAliveMessageReceived = (msg: Message): void => {
    // 5. However, if an answer is received within time T from any other process Q
    if (
      msg.fromId > this.id &&
      this.state === ProcessState.WaitingForElectionsAlive
    ) {
      this.state = ProcessState.WaitingForVictory;
      // 5. (I) Process P again waits for time interval T’
      // to receive another message from Q that it has been elected as coordinator.
      setTimeout(() => {
        // 5. (II) If Q doesn’t responds within time interval T’ (TIME_TO_WAIT_FOR_VICTORY)
        // then it is assumed to have failed and algorithm is restarted.
        if (this.state === ProcessState.WaitingForVictory) {
          this.announceElection();
        }
      }, TIME_TO_WAIT_FOR_VICTORY);
    }
  };

  announceMyselfAsACoordinator = (): void => {
    // 4. Then it sends a message to all lower priority number
    // processes that it is elected as their new coordinator.
    MessageBroker.emit(BROADCAST_EVENT_NAME, {
      fromId: this.id,
      type: MessageType.Victory,
    } as Message);
  };

  onElectionVictoryMessageReceived = (msg: Message): void => {
    this.coordinatorId = msg.fromId;
    this.state = ProcessState.Idle;
    this.counter += 1;
  };

  kill = (): void => {
    this.state = ProcessState.Dead;
    this.coordinatorId = null;
    clearInterval(this.pingInterval);
    MessageBroker.off(this.inboxEventName, this.onMessageReceived);
    MessageBroker.off(BROADCAST_EVENT_NAME, this.onMessageReceived);
  };
}
