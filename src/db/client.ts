import { db } from './mockDatabase';

export interface DatabaseConfig {
  connectionString?: string;
  isMock: boolean;
}

export const getDatabaseClient = () => {
  return db;
};
