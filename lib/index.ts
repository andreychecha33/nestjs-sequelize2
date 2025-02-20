import {ConnectionStorage, CONNECTION_STORAGE_PROP} from './connection.storage';

declare global {
  namespace NodeJS {
  	interface Process {
  	  [CONNECTION_STORAGE_PROP]: ConnectionStorage
  	}
  }
}

process[CONNECTION_STORAGE_PROP] ??= new ConnectionStorage();

export * from './common';
export * from './interfaces';
export * from './sequelize.module';
