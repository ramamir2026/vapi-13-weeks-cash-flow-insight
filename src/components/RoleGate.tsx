import { ReactNode } from "react";
import { useCurrentRole, type EffectiveRole } from "@/hooks/useControls";

interface Props {
  role: EffectiveRole; // minimum required
  children: ReactNode;
  fallback?: ReactNode;
}

const order: Record<EffectiveRole, number> = {
  viewer: 0,
  editor: 1,
  approver: 2,
};

export const RoleGate = ({ role, children, fallback = null }: Props) => {
  const { data: current } = useCurrentRole();
  if (!current) return <>{fallback}</>;
  return order[current] >= order[role] ? <>{children}</> : <>{fallback}</>;
};
