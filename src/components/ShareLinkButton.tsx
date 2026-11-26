import React from 'react';
import CopyButton from './CopyButton';

/** Copies the canonical current URL, including /search query parameters. */
export default function ShareLinkButton({ label = 'Copy link' }: { label?: string }) {
  const value = typeof window === 'undefined' ? '' : window.location.href;
  return <CopyButton dataToCopy={value} label={label} iconSize={14} />;
}
