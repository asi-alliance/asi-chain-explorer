import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const SITE_TITLE = 'ASI Chain Explorer';

const decode = (value: string): string => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const shorten = (value: string, head = 8, tail = 6): string => (
    value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`
);

const shortQuery = (value: string): string => (
    value.length <= 42 ? value : `${value.slice(0, 40)}…`
);

/** The browser tab title for a location, before the site suffix. */
export function routeTitle(pathname: string, search = ''): string {
    const segments = pathname.split('/').filter(Boolean);
    const params = new URLSearchParams(search);
    const query = params.get('q')?.trim() ?? '';

    if (segments.length === 0) {
        if (query) return `Search: ${shortQuery(query)}`;
        return params.get('finalized') === '1' ? 'Finalized blocks' : 'Latest blocks';
    }

    if (segments[0] === 'transaction' && segments[1]) {
        return `Transaction ${shorten(decode(segments[1]))}`;
    }

    if (segments[0] === 'block' && segments[1] === 'hash' && segments[2]) {
        return `Block ${shorten(decode(segments[2]))}`;
    }

    if ((segments[0] === 'height' || segments[0] === 'block') && segments[1]) {
        return `Height #${decode(segments[1])}`;
    }

    if (segments[0] === 'address' && segments[1]) {
        return `Address ${shorten(decode(segments[1]))}`;
    }

    if (segments[0] === 'search') {
        return query ? `Search: ${shortQuery(query)}` : 'Search';
    }

    if (segments[0] === 'transactions') {
        return params.get('tab') === 'transfers' ? 'Transfers' : 'Deployments';
    }

    const staticTitles: Record<string, string> = {
        '/blocks': 'Latest blocks',
        '/pending': 'Pending deploys',
        '/validators': 'Validators',
        '/validator-history': 'Validator history',
        '/statistics': 'Statistics',
        '/indexer-status': 'Indexer status',
    };

    return staticTitles[`/${segments[0]}`] ?? 'Page not found';
}

/** Keeps the browser tab in sync with the current route. */
export default function RouteTitle() {
    const { pathname, search } = useLocation();
    const title = routeTitle(pathname, search);

    useEffect(() => {
        document.title = `${title} · ${SITE_TITLE}`;
    }, [title]);

    return null;
}
