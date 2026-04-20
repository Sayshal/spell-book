import { MODULE } from '../constants.mjs';
import { log } from './logger.mjs';

/** Socket handler for delegating privileged operations to GM clients. */
export class SocketHandler {
  constructor() {
    this.#registerQueries();
  }

  #registerQueries() {
    CONFIG.queries[MODULE.ID] = async (data, _queryOptions) => {
      try {
        const { type } = data;
        log(3, `Received socket query: ${type}`);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    };
  }
}
