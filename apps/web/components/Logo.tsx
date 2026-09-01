import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="w-9 h-9 rounded-2xl bg-brand-600 grid place-items-center shadow-soft">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 21s-7-4.3-7-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5.7-7 10-7 10h-4z"
            stroke="white"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M9 11h6M12 8v6" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div className="font-display font-bold text-base text-ink-900">Patiently</div>
    </div>
  );
}
