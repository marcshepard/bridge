// What the Worker can reach: its bindings (see wrangler.jsonc).

import type { EventHub } from "./hub";

export interface Env {
  /** The API's own D1 database. Reachable only through this Worker. */
  DB: D1Database;
  /** One EventHub Durable Object per game, for pushing changes to connected phones. */
  HUB: DurableObjectNamespace<EventHub>;
  /** "true" enables the dev-only "fill with test players" endpoint. */
  ALLOW_TEST_PLAYERS?: string;
}
