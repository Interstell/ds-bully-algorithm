import * as util from 'util';
import { EventEmitter } from 'events';

import { Message, MessageType } from './System.types';
import logger from './logger';

class MessageBroker extends EventEmitter {
  constructor() {
    super();
  }
  emit(event: string | symbol, ...args): boolean {
    const msg: Message = args[0];
    switch (msg.type) {
      case MessageType.Ping:
      case MessageType.Pong:
        logger.debug(`[${String(event)}] ${util.inspect(msg)}`);
        break;
      default:
        logger.verbose(`Process ${msg.fromId}: ${msg.type}`);
        break;
    }
    return super.emit(event, ...args);
  }
}

const messageBroker = new MessageBroker();

export default messageBroker;
