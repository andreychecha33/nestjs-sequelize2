import {Inject} from '@nestjs/common';
import {Sequelize, SequelizeOptions} from 'sequelize-typescript';
import {Transaction} from 'sequelize';
import {SequelizeModuleOptions} from '../interfaces/sequelize-options.interface';
import {DEFAULT_CONNECTION_NAME} from '../sequelize.constants';
import {getConnectionToken, getModelToken} from './sequelize.utils';

import {ConnectionStorage, CONNECTION_STORAGE_PROP} from '../connection.storage';

const connectionStorage: ConnectionStorage = process[CONNECTION_STORAGE_PROP];

export interface WithTransactionOptions {
	error?: any;
	name?: string;
}

export function WithTransaction(options: WithTransactionOptions):
	(target: any, propertyKey: string, descriptor: PropertyDescriptor) => void
{
	return function(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
		const originalMethod = descriptor.value;

		if(typeof originalMethod !== 'function') {
			throw new Error(`The current decorator can only work with methods`);
		}

		descriptor.value = async function (...args: any[]) {
			Reflect.defineMetadata("with-transaction", options, target, propertyKey);
			const connectionName = options?.name || DEFAULT_CONNECTION_NAME;
    		const connection = connectionStorage.get<Sequelize>(connectionName);

    		if(!connection) {
    			throw new Error(`Sequelize Connection with name "${connectionName}" - NOT FOUND`);
    		}

    		const payload = args[0];
    		if(payload && payload instanceof Transaction) {
    			return await originalMethod.call(this, ...args);
    		} else {
    			try {
    				return await connection.transaction({}, async(t: Transaction) => {
    					return await originalMethod.call(this, t, ...(args.slice(1)));
    				})
    			} catch(e: any) {
    				if(options.error && typeof options.error === 'function') options.error.call(null, e);
    			}
    		}
		}
	}
}
