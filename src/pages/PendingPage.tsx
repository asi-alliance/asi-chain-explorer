import React from 'react';
import PendingDeploysPanel from '../components/PendingDeploysPanel';

// Deploys that the node holds in its deploy buffers and that no indexed block includes yet.
const PendingPage: React.FC = () => <PendingDeploysPanel />;

export default PendingPage;
