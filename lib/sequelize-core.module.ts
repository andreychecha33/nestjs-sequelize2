import {
  DynamicModule,
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
  Provider,
  Type,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { defer, lastValueFrom } from 'rxjs';
import { Sequelize, SequelizeOptions, addOptions, getOptions } from 'sequelize-typescript';
import { ModelOptions } from 'sequelize';
import {
  generateString,
  getConnectionToken,
  handleRetry,
} from './common/sequelize.utils';
import { EntitiesMetadataStorage } from './entities-metadata.storage';
import {
  SequelizeModuleAsyncOptions,
  SequelizeModuleOptions,
  SequelizeOptionsFactory,
} from './interfaces/sequelize-options.interface';
import {
  DEFAULT_CONNECTION_NAME,
  SEQUELIZE_MODULE_ID,
  SEQUELIZE_MODULE_OPTIONS,
} from './sequelize.constants';

import {ConnectionStorage, CONNECTION_STORAGE_PROP} from './connection.storage';

const connectionStorage: ConnectionStorage = process[CONNECTION_STORAGE_PROP];

@Global()
@Module({})
export class SequelizeCoreModule implements OnApplicationShutdown {
  constructor(
    @Inject(SEQUELIZE_MODULE_OPTIONS) private readonly options: SequelizeModuleOptions,
    //private readonly moduleRef: ModuleRef,
  ) {}

  static forRoot(options: SequelizeModuleOptions = {}): DynamicModule {
    const sequelizeModuleOptions = {
      provide: SEQUELIZE_MODULE_OPTIONS,
      useValue: options,
    };
    const connectionProvider = {
      provide: getConnectionToken(options as SequelizeOptions) as string,
      useFactory: async () => await this.createConnectionFactory(options),
    };

    return {
      module: SequelizeCoreModule,
      providers: [connectionProvider, sequelizeModuleOptions],
      exports: [connectionProvider],
    };
  }

  static forRootAsync(options: SequelizeModuleAsyncOptions): DynamicModule {
    const connectionProvider = {
      provide: getConnectionToken(options as SequelizeOptions) as string,
      useFactory: async (sequelizeOptions: SequelizeModuleOptions) => {
        if (options.name) {
          return await this.createConnectionFactory({
            ...sequelizeOptions,
            name: options.name,
          });
        }
        return await this.createConnectionFactory(sequelizeOptions);
      },
      inject: [SEQUELIZE_MODULE_OPTIONS],
    };

    const asyncProviders = this.createAsyncProviders(options);
    return {
      module: SequelizeCoreModule,
      imports: options.imports,
      providers: [
        ...asyncProviders,
        connectionProvider,
        {
          provide: SEQUELIZE_MODULE_ID,
          useValue: generateString(),
        },
      ],
      exports: [connectionProvider],
    };
  }

  async onApplicationShutdown() {
    //const connection = this.moduleRef.get<Sequelize>(
    //  getConnectionToken(this.options as SequelizeOptions) as Type<Sequelize>,
    //);
    //connection && (await connection.close());
    const connectionName = this.options?.name || DEFAULT_CONNECTION_NAME;
    const connection = connectionStorage.get<Sequelize>(connectionName);
    connection && (await connection.close());
    connectionStorage.remove(connectionName);
  }

  private static createAsyncProviders(
    options: SequelizeModuleAsyncOptions,
  ): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }
    const useClass = options.useClass as Type<SequelizeOptionsFactory>;
    return [
      this.createAsyncOptionsProvider(options),
      {
        provide: useClass,
        useClass,
      },
    ];
  }

  private static createAsyncOptionsProvider(
    options: SequelizeModuleAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: SEQUELIZE_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }
    // `as Type<SequelizeOptionsFactory>` is a workaround for microsoft/TypeScript#31603
    const inject = [
      (options.useClass ||
        options.useExisting) as Type<SequelizeOptionsFactory>,
    ];
    return {
      provide: SEQUELIZE_MODULE_OPTIONS,
      useFactory: async (optionsFactory: SequelizeOptionsFactory) =>
        await optionsFactory.createSequelizeOptions(options.name),
      inject,
    };
  }

  private static async createConnectionFactory(
    options: SequelizeModuleOptions,
  ): Promise<Sequelize> {
    return lastValueFrom(
      defer(async () => {
        const connectionToken = options.name || DEFAULT_CONNECTION_NAME;
        //const connectionToken = options.name || DEFAULT_CONNECTION_NAME;
        const models = EntitiesMetadataStorage.getEntitiesByConnection(
          connectionToken,
        );

        // ...
        if(options.tableNames) {
          await models.forEach(async (model: any) => {
            const _options: any = getOptions(model.prototype);
            const tableName = _options?.tableName;
            if(tableName && (options.tableNames as any).hasOwnProperty(tableName)) {
              addOptions(model.prototype, {tableName: (options.tableNames as any)[tableName]});
            }
          });
        }
        // ...

        const sequelize = options?.uri
          ? new Sequelize(options.uri, options)
          : new Sequelize(options);

        if(!!connectionStorage.get<Sequelize>(connectionToken)) {
      		await sequelize.close();
      		throw new Error(`A connection with token "${connectionToken}" already exists`);
      	}
      	connectionStorage.add<Sequelize>(connectionToken, sequelize);
        // ....

        if (!options.autoLoadModels) {
          return sequelize;
        }

        sequelize.addModels(models as any);

        await sequelize.authenticate();

        if (typeof options.synchronize === 'undefined' || options.synchronize) {
          await sequelize.sync(options.sync);
        }

        return sequelize;
      }).pipe(handleRetry(options.retryAttempts, options.retryDelay)),
    );
  }
}
