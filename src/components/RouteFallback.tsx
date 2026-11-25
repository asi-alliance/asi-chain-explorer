import React from "react";

// Keeps the header and navigation stable while a lazily loaded route arrives.
const RouteFallback: React.FC = () => (
    <div className="route-fallback" role="status" aria-live="polite">
        <span className="loading" aria-hidden="true"></span>
        <p className="text-muted">Loading page...</p>
    </div>
);

export default RouteFallback;
