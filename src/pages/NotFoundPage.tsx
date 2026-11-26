import React from "react";
import { Link, useLocation } from "react-router-dom";
import AdvancedSearch from "../components/AdvancedSearch";
import "../styles/not-found.css";

const NotFoundPage: React.FC = () => {
    const { pathname } = useLocation();

    return (
        <div className="not-found">
            <section className="asi-card glass not-found__card">
                <p className="not-found__code">Error 404</p>
                <h1>Page not found</h1>
                <p className="not-found__text">
                    This address does not match any explorer page. It may have
                    moved, or the link may be mistyped.
                </p>
                <div className="not-found__attempt">
                    <span className="not-found__path">{pathname}</span>
                </div>

                <div className="not-found__search">
                    <AdvancedSearch
                        embedded={true}
                        placeholder="Height, hash, tx or address"
                    />
                </div>

                <nav className="not-found__links" aria-label="Suggested pages">
                    <Link className="btn btn-primary" to="/">
                        Recent blocks
                    </Link>
                    <Link className="btn btn-secondary" to="/transactions">
                        Transactions
                    </Link>
                    <Link className="btn btn-secondary" to="/validators">
                        Validators
                    </Link>
                </nav>

                <p className="not-found__hint">
                    The header search is always available with Ctrl/Cmd + K.
                </p>
            </section>
        </div>
    );
};

export default NotFoundPage;
