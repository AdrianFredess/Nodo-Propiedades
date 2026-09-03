import { CANAL_LABEL } from '../lib/labels';
import type { CanalOrigen } from '../types/lead';
import { CanalIcon } from './CanalIcon';

interface CanalChipProps {
  canal: CanalOrigen;
  showLabel?: boolean;
  className?: string;
}

export function CanalChip({
  canal,
  showLabel = true,
  className = '',
}: CanalChipProps) {
  const label = CANAL_LABEL[canal];
  return (
    <span
      className={`chip chip--sm chip--${canal} chip--canal chip--with-icon${className ? ` ${className}` : ''}`}
      title={label}
    >
      <CanalIcon canal={canal} size={12} />
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}
