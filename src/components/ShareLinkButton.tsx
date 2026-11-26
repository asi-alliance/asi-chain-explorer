import React from 'react';
import CopyButton from './CopyButton';

/** Copies the canonical current URL, including /search query parameters. */
export default function ShareLinkButton({
  label = 'Copy link',
  text,
  className,
}: {
  label?: string;
  text?: string;
  className?: string;
}) {
  const value = typeof window === 'undefined' ? '' : window.location.href;
  return (
    <CopyButton
      dataToCopy={value}
      label={label}
      text={text}
      className={className}
      iconSize={14}
      toastMessage="Link copied"
    />
  );
}
