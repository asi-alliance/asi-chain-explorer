import type { DefaultOptions } from '@apollo/client';

// Hasura reports failures such as statement timeouts as HTTP 200 responses with
// an `errors` array. Surface them as errors: ignoring them turns a failed
// observation into missing data, which views render as zero amounts, "no
// results" or an accepted partial page.
export const defaultOptions: DefaultOptions = {
  watchQuery: { errorPolicy: 'none' },
  query: { errorPolicy: 'none' },
};
