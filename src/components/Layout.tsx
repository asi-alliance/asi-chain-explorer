import React, { useCallback, useEffect, useRef, useState } from "react";
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
    const [paletteOpen, setPaletteOpen] = useState(false);
    const paletteOpenRef = useRef(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLElement | null>(null);

    const closePalette = useCallback(() => {
        setPaletteOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
    }, []);

    useEffect(() => {
        paletteOpenRef.current = paletteOpen;
    }, [paletteOpen]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
            event.preventDefault();
            if (paletteOpenRef.current) {
                closePalette();
            } else {
                triggerRef.current = document.activeElement as HTMLElement | null;
                setPaletteOpen(true);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [closePalette]);

    useEffect(() => {
        if (!paletteOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closePalette();
                return;
            }
            if (event.key !== "Tab" || !dialogRef.current) return;
            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
            )).filter((element) => element.offsetParent !== null);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [paletteOpen, closePalette]);

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

            {paletteOpen && (
                <div
                    className="search-palette"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closePalette();
                    }}
                >
                    <div
                        className="search-palette__dialog"
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Search the chain"
                    >
                        <div className="search-palette__top">
                            <AdvancedSearch
                                variant="palette"
                                autoFocus
                                showRecent
                                onNavigate={closePalette}
                                placeholder="Search block, tx, or address"
                            />
                            <button
                                type="button"
                                className="search-palette__close"
                                onClick={closePalette}
                            >
                                Close
                            </button>
                        </div>
                        <p className="search-palette__hint">
                            <kbd>Esc</kbd> close · <kbd>↵</kbd> open · <kbd>Ctrl K</kbd> toggle
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Layout;
