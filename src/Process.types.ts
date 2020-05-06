export enum ProcessState {
  Idle = 'IDLE',
  Dead = 'DEAD',
  WaitingForCoordinatorPong = 'WAITING_FOR_COORDINATOR_PONG',
  WaitingForElectionsAlive = 'WAITING_FOR_ELECTIONS_ALIVE',
  WaitingForVictory = 'WAITING_FOR_VICTORY',
}
