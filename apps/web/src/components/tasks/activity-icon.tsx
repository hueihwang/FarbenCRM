"use client";

import { Phone, Users, MapPin, Mail, MessageCircle, Package, Flag } from "lucide-react";
import type { ActivityType } from "@/lib/activity-types";

const ICONS: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  meeting: Users,
  visit: MapPin,
  email: Mail,
  message: MessageCircle,
  sample: Package,
  follow_up: Flag,
};

export function ActivityIcon({ type, className }: { type?: string | null; className?: string }) {
  const Icon = ICONS[(type as ActivityType) ?? "follow_up"] ?? Flag;
  return <Icon className={className} aria-hidden="true" />;
}
