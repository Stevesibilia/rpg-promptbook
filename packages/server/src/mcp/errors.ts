import type { FastifyBaseLogger } from 'fastify';
import { AppError } from '../errors.js';

// What a failed tool call tells a model (connector design decision 10, as
// gdrarchive's mcp/errors.ts). A tool error rather than a transport failure:
// one call failing must not fail the request it came in. The message says
// what to do next; an unexpected failure says nothing about itself and goes
// to the log, since a stack trace or a statement in a result is a leak to
// whatever the model does next.

export interface ToolError {
  isError: true;
  content: { type: 'text'; text: string }[];
  structuredContent: {
    error: {
      code: string;
      message: string;
      // The input field to look at, when there is one.
      field?: string;
      // The scope that would have been accepted.
      scope_required?: string;
      // Seconds to wait before the next write, for rate_limited.
      retry_after?: number;
      // What the model needs to correct the call: the valid targets, the
      // problems an edit would add.
      details?: unknown;
    };
  };
}

// A refusal that carries data for the model besides its message.
export class ToolRefusal extends AppError {
  constructor(
    status: number,
    code: string,
    message: string,
    readonly details?: unknown,
    readonly field?: string,
  ) {
    super(status, code, message);
  }
}

// Too many writes from one grant.
export class RateLimited extends AppError {
  constructor(readonly retryAfter: number) {
    super(
      429,
      'rate_limited',
      `Too many changes from this connection: wait ${retryAfter} seconds before the next one.`,
    );
  }
}

export const INSUFFICIENT_SCOPE = () =>
  new AppError(403, 'insufficient_scope', 'This tool changes the project and needs read and edit access.');

function toolError(code: string, message: string, extra: Omit<ToolError['structuredContent']['error'], 'code' | 'message'> = {}): ToolError {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: { error: { code, message, ...extra } },
  };
}

// Every tool's failure goes through here, so no tool invents its own
// vocabulary or leaks an internal by forgetting to catch.
export function toToolError(thrown: unknown, log: FastifyBaseLogger, tool: string): ToolError {
  if (thrown instanceof AppError) {
    if (thrown.code === 'insufficient_scope') {
      // A tool result cannot trigger step-up: say what must happen outside.
      return toolError(
        'insufficient_scope',
        'This connection was approved to read your projects only. Reconnect it in Claude and choose Read and edit your projects to make changes.',
        { scope_required: 'read_write' },
      );
    }
    if (thrown instanceof RateLimited) {
      return toolError(thrown.code, thrown.message, { retry_after: thrown.retryAfter });
    }
    if (thrown.status >= 500) {
      log.error({ err: thrown, code: thrown.code, tool }, thrown.message);
      return toolError('internal_error', 'Promptbook could not complete that call. Read the project again before you retry.');
    }
    const extra: Omit<ToolError['structuredContent']['error'], 'code' | 'message'> = {};
    if (thrown instanceof ToolRefusal) {
      if (thrown.field !== undefined) extra.field = thrown.field;
      if (thrown.details !== undefined) extra.details = thrown.details;
    }
    return toolError(thrown.code, thrown.message, extra);
  }
  log.error({ err: thrown, tool }, 'MCP tool call failed unexpectedly');
  return toolError('internal_error', 'Promptbook could not complete that call. Read the project again before you retry.');
}
