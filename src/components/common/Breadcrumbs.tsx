import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  return (
    <nav className="flex items-center text-xs text-slate-500 space-x-1.5" aria-label="Breadcrumb">
      <Link to="/" className="hover:text-slate-900 transition-colors flex items-center">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            {item.path && !isLast ? (
              <Link to={item.path} className="hover:text-slate-900 transition-colors font-medium">
                {item.label}
              </Link>
            ) : (
              <span className={`truncate ${isLast ? 'text-slate-800 font-semibold' : ''}`}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
