import { Building, Phone, Video } from "lucide-react";
import type { MeetingType } from "@/lib/types";

export function MeetingIcon({ type, className }: { type: MeetingType; className?: string }) {
  if (type === "Video") return <Video className={className} aria-hidden />;
  if (type === "Phone") return <Phone className={className} aria-hidden />;
  return <Building className={className} aria-hidden />;
}
