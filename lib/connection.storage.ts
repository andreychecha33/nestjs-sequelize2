export const CONNECTION_STORAGE_PROP = 'Sequelize.Connection.Storage';

export class ConnectionStorage {
	protected storage: {[key: string]: any} = {};

	constructor() {}

	public add<T>(name: string, value: T): void {
		this.storage[name] = value;
	}

	public remove(name: string): void {
		delete this.storage[name];
	}

	public get<T>(name: string): T|undefined {
		return this.storage[name];
	}
}
