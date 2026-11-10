import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/utils/cn';

export interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  isPositive?: boolean;
  subtitle?: string;
  icon?: React.ReactNode;
  iconBgColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  isPositive,
  subtitle,
  icon,
  iconBgColor = 'bg-blue-50 text-blue-600',
}) => {
  return (
    <Card className="p-5 flex flex-col justify-between hover:border-slate-300 transition-all shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{value}</h3>
        </div>
        {icon && (
          <div className={cn('p-2.5 rounded-xl flex items-center justify-center shrink-0', iconBgColor)}>
            {icon}
          </div>
        )}
      </div>

      {(change || subtitle) && (
        <div className="mt-3.5 flex items-center gap-2 text-xs pt-2 border-t border-slate-100">
          {change && (
            <span
              className={cn(
                'inline-flex items-center font-semibold gap-0.5',
                isPositive ? 'text-emerald-600' : 'text-rose-600'
              )}
            >
              {isPositive ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {change}
            </span>
          )}
          {subtitle && <span className="text-slate-500">{subtitle}</span>}
        </div>
      )}
    </Card>
  );
};
