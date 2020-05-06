export type ProcessFileRecord = {
  id: number;
  fullName: string;
};

export enum MessageType {
  Ping = 'PING',
  Pong = 'PONG',
  ElectionAnnounced = 'ELECTION_ANNOUNCED',
  Alive = 'ALIVE',
  Victory = 'VICTORY',
}

export type Message = {
  fromId: number;
  toId?: number;
  type: MessageType;
};
