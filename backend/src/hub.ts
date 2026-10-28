// EventHub: one Durable Object per game. It holds a WebSocket to every connected phone and pushes
// changes to them. It stores nothing important: D1 is the store of record. If the hub restarts,
// phones reconnect and catch up with GET /results?since=.
//
// Uses the WebSocket Hibernation API, so an idle game costs nothing while phones stay connected.

import { DurableObject } from "cloudflare:workers";
import type { PushMessage } from "./api-types";
import type { Env } from "./env";

/** How long a pass to open a live connection lasts. A device uses it straight away. */
const TICKET_MS = 60_000;

interface Ticket {
  slot: number;
  playerId: string;
  expires: number;
}

export class EventHub extends DurableObject<Env> {
  /**
   * Single-use passes to open a live connection. Browsers can't put headers on a WebSocket, and a
   * player's secret key in the address would end up in logs, so the device swaps its key for one
   * of these first (POST .../live-ticket) and puts that in the address instead. Kept in memory: if
   * the object restarts in between, the connection fails once and the device asks again.
   */
  private readonly tickets = new Map<string, Ticket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Phones send "ping" to keep the connection alive; answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** A pass for a player the Worker has checked. */
  async issueTicket(slot: number, playerId: string): Promise<string> {
    const now = Date.now();
    for (const [id, t] of this.tickets) if (t.expires < now) this.tickets.delete(id);
    const id = crypto.randomUUID();
    this.tickets.set(id, { slot, playerId, expires: now + TICKET_MS });
    return id;
  }

  /** WebSocket upgrade with a pass from issueTicket (`?ticket=`), forwarded by the Worker. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const id = new URL(request.url).searchParams.get("ticket") ?? "";
    const ticket = this.tickets.get(id);
    this.tickets.delete(id);
    if (!ticket || ticket.expires < Date.now()) {
      return Response.json({ error: "You're not a player in this game" }, { status: 403 });
    }
    const pair = new WebSocketPair();
    // Tagged with the player's key too, so a replaced player's device can be cut off (closePlayer).
    this.ctx.acceptWebSocket(pair[1], [String(ticket.slot), `id:${ticket.playerId}`]);
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

  /** Close a player's connections: their seat has gone to someone else (or another device). */
  async closePlayer(playerId: string): Promise<void> {
    for (const [id, t] of this.tickets) if (t.playerId === playerId) this.tickets.delete(id);
    for (const ws of this.ctx.getWebSockets(`id:${playerId}`)) ws.close(1000, "Seat taken over");
    this.broadcastPresence();
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
      for (const tag of this.ctx.getTags(ws)) if (!tag.startsWith("id:")) slots.add(Number(tag));
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
