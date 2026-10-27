// EventHub: one Durable Object per game. It holds a WebSocket to every connected phone and pushes
// changes to them. It stores nothing important: D1 is the store of record. If the hub restarts,
// phones reconnect and catch up with GET /results?since=.
//
// Uses the WebSocket Hibernation API, so an idle game costs nothing while phones stay connected.

import { DurableObject } from "cloudflare:workers";
import type { PushMessage } from "./api-types";
import type { Env } from "./env";

export class EventHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Phones send "ping" to keep the connection alive; answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** WebSocket upgrade, forwarded by the Worker after it has checked the player. */
  async fetch(request: Request): Promise<Response> {
    const slot = request.headers.get("X-Slot");
    if (request.headers.get("Upgrade") !== "websocket" || !slot) {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [slot]);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Called by the Worker after a change, over RPC. */
  async notify(message: PushMessage): Promise<void> {
    this.broadcast(message);
    if (message.type === "deleted") {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, "Game deleted");
    }
  }

  /** Slots with at least one open connection. */
  async connectedSlots(): Promise<number[]> {
    return this.openSlots();
  }

  async webSocketMessage(): Promise<void> {
    // Phones don't send anything except pings (handled by the auto-response).
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // Complete the closing handshake. 1005/1006 mean "no code" / "dropped" (a phone that died or
    // lost signal); they can't be sent back, so answer with a normal close.
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // Already closed.
    }
    this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastPresence(ws);
  }

  private openSlots(except?: WebSocket): number[] {
    const slots = new Set<number>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      for (const tag of this.ctx.getTags(ws)) slots.add(Number(tag));
    }
    return [...slots].sort((a, b) => a - b);
  }

  private broadcastPresence(closing?: WebSocket): void {
    this.broadcast({ type: "presence", connected: this.openSlots(closing) }, closing);
  }

  private broadcast(message: PushMessage, skip?: WebSocket): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === skip) continue;
      try {
        ws.send(text);
      } catch {
        // A socket that just died; its close handler will update presence.
      }
    }
  }
}
