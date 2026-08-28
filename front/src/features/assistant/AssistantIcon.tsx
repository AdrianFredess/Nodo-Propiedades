import { Sparkles } from 'lucide-react';

interface AssistantIconProps {
  size?: number;
  className?: string;
}

/** Ícono estrella/brillo estilo asistente (Mercado Pago). */
export function AssistantIcon({ size = 22, className }: AssistantIconProps) {
  return (
    <Sparkles
      className={className}
      size={size}
      strokeWidth={2.25}
      aria-hidden
    />
  );
}
