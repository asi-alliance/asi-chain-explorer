import React from 'react';
import { Search } from 'lucide-react';
import '../styles/search-field.css';

export interface SearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> {
  className?: string;
  inputClassName?: string;
}

/** The shared search-field surface used outside the header omnibox. */
export default function SearchField({
  className = '',
  inputClassName = '',
  type = 'search',
  ...inputProps
}: SearchFieldProps) {
  return (
    <div className={`search-field ${className}`.trim()}>
      <Search className="search-field__leading" size={18} aria-hidden="true" />
      <input
        {...inputProps}
        type={type}
        className={`search-field__input ${inputClassName}`.trim()}
        autoComplete={inputProps.autoComplete ?? 'off'}
        autoCapitalize={inputProps.autoCapitalize ?? 'none'}
        autoCorrect={inputProps.autoCorrect ?? 'off'}
        spellCheck={inputProps.spellCheck ?? false}
      />
    </div>
  );
}
