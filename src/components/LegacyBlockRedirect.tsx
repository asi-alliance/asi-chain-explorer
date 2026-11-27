import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Older explorer links used `/block/{height}` for the DAG height overview.
 * Keep them working while `/height/{height}` becomes the canonical URL.
 */
export default function LegacyBlockRedirect() {
  const { blockNumber = '' } = useParams<{ blockNumber: string }>();
  const { search } = useLocation();
  const pathname = /^\d+$/.test(blockNumber)
    ? `/height/${blockNumber}`
    : `/block/hash/${encodeURIComponent(blockNumber)}`;

  return <Navigate to={{ pathname, search }} replace />;
}
