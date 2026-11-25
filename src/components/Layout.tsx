import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AdvancedSearch from "./AdvancedSearch";
import ConnectionStatus from "./ConnectionStatus";
import { usePendingDeploysStatus } from "../hooks/usePendingDeploysStatus";
import Logo from "./Logo";

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    // Pending deploys are optional: the indexer reads them only when it is
    // configured with the validators that accept deploys.
    const pendingDeploys = usePendingDeploysStatus();

    const isActive = (href: string) => {
        if (href === "/") {
            return location.pathname === "/";
        }
        return location.pathname.startsWith(href);
    };

    const navigation = [
        { name: "Blocks", href: "/" },
        { name: "Transactions", href: "/transactions" },
        ...(pendingDeploys.status || pendingDeploys.loading ? [{ name: "Pending", href: "/pending" }] : []),
        // { name: "ASI Transfers", href: "/transfers" },
        // { name: "Deployments", href: "/deployments" },
        { name: "Validators", href: "/validators" },
        { name: "Statistics", href: "/statistics" },
        { name: "Indexer", href: "/indexer-status" },
    ];

    const goHome = () => {
        navigate("/");
    };

    return (
        <div className="container">
            <header>
                <div className="header-container">
                    <div className="header-left" onClick={goHome}>
                        <Logo size="large" showText={true} />
                    </div>
                    <div className="header-right">
                        <div className="global-search-slot">
                            <AdvancedSearch
                                embedded={true}
                                placeholder="Search block, tx, or address"
                            />
                        </div>
                        <ConnectionStatus
                            position="inline"
                            showDetails={false}
                            size="sm"
                        />
                    </div>
                </div>

                {/* Navigation Tabs */}
                <h3 className="nav-tabs">
                    {navigation.map((item) => (
                        <Link
                            key={item.name}
                            to={item.href}
                            className={`nav-tab ${
                                isActive(item.href) ? "active" : ""
                            }`}
                        >
                            {item.name}
                        </Link>
                    ))}
                </h3>
            </header>

            <main className="fade-in">{children}</main>
        </div>
    );
};

export default Layout;
