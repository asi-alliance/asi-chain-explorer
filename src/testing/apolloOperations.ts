// Test helpers for components that call useQuery/useSubscription directly.
// The test file must mock both hooks:
//   jest.mock('@apollo/client', () => ({ ...jest.requireActual('@apollo/client'),
//     useQuery: jest.fn(), useSubscription: jest.fn() }));
import { useQuery, useSubscription } from '@apollo/client';
import type { DocumentNode } from '@apollo/client';

export type OperationResult = { data?: unknown; loading?: boolean; error?: Error; refetch?: jest.Mock };
type Handler = (variables: Record<string, unknown> | undefined) => OperationResult;

export function operationName(document: DocumentNode): string {
  const definition = document.definitions.find((d) => d.kind === 'OperationDefinition') as
    | { name?: { value: string } }
    | undefined;
  return definition?.name?.value ?? '';
}

/**
 * Answers each operation by name; a skipped or unknown operation returns no data.
 * Returns the operations that were requested without `skip`.
 */
export function mockOperations(handlers: Record<string, Handler>): string[] {
  const requested: string[] = [];
  const answer = (document: DocumentNode, options?: { variables?: Record<string, unknown>; skip?: boolean }) => {
    const name = operationName(document);
    if (options?.skip) return { data: undefined, loading: false, error: undefined, refetch: jest.fn() };
    requested.push(name);
    const handler = handlers[name];
    return { data: undefined, loading: false, error: undefined, refetch: jest.fn(), ...(handler ? handler(options?.variables) : {}) };
  };
  (useQuery as jest.Mock).mockImplementation(answer);
  (useSubscription as jest.Mock).mockImplementation(answer);
  return requested;
}

export const pendingStatusRows = (status: Record<string, unknown> = {}, updatedAt = new Date()) => [
  {
    __typename: 'indexer_state',
    key: 'pending_deploys_status',
    value: JSON.stringify({ nodes: 3, reachable: 3, count: 0, total_available: 0, interval_ms: 1000, ...status }),
    updated_at: updatedAt.toISOString().replace('Z', ''),
  },
];
