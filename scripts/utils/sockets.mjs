import { MODULE } from '../constants.mjs';

/** Socket handler for delegating privileged operations to GM clients. */
export class SocketHandler {
  /** Wires the cross-client query handler so other clients can request work via game.users.query. */
  constructor() {
    this.#registerQueries();
  }

  /** Register the module's CONFIG.queries handler for cross-client socket requests. */
  #registerQueries() {
    CONFIG.queries[MODULE.ID] = async (data, _queryOptions) => {
      try {
        const { type } = data;
        ATLAS.log(3, `Received socket query: ${type}`);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    };
  }
}
