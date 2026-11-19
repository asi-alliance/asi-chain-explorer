import { ApolloClient, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { amountTypePolicies } from './utils/amountPolicies';
import { defaultOptions } from './apolloDefaults';
import type { PublicConfig } from './runtimeConfig';

// The explorer reads only data that Hasura's public role exposes. It sends no
// admin secret or shared bearer token: anything in the bundle is public.
export function createApolloClient(config: Pick<PublicConfig, 'graphqlUrl' | 'graphqlWsUrl'>) {
  const httpLink = createHttpLink({ uri: config.graphqlUrl });

  const wsLink = new GraphQLWsLink(createClient({ url: config.graphqlWsUrl }));

  const splitLink = split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === 'OperationDefinition' &&
        definition.operation === 'subscription'
      );
    },
    wsLink,
    httpLink
  );

  return new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache({
      typePolicies: {
        ...amountTypePolicies,
        blocks: {
          keyFields: ['block_hash'],
        },
        deployments: {
          ...amountTypePolicies.deployments,
          keyFields: ['deploy_id'],
        },
        transfers: {
          ...amountTypePolicies.transfers,
          keyFields: ['id'],
        },
        validators: {
          ...amountTypePolicies.validators,
          keyFields: ['public_key'],
        },
        pending_deploys: {
          ...amountTypePolicies.pending_deploys,
          keyFields: ['sig'],
        },
      },
    }),
    defaultOptions,
  });
}
