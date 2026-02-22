import { Clock } from "lucide-react";

interface Activity {
  id: string;
  action: string;
  resourceType: string;
  createdAt: Date;
  userName?: string | null;
}

interface ActivityTimelineProps {
  activities: Activity[];
}

const formatTimeAgo = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const formatAction = (action: string, resourceType: string) => {
  const actionMap: Record<string, string> = {
    "control.update": "Updated control",
    "control.create": "Created control",
    "poam.create": "Created POA&M",
    "poam.update": "Updated POA&M",
    "poam.close": "Closed POA&M",
    "evidence.create": "Registered evidence",
    "attestation.create": "Created attestation",
  };
  return actionMap[action] || `${action} on ${resourceType}`;
};

export default function ActivityTimeline({ activities }: ActivityTimelineProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">Recent Activity</h3>
      <div className="space-y-4">
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500">No recent activity</p>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#3B82F6]/10">
                <Clock className="h-4 w-4 text-[#3B82F6]" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-900">
                  {formatAction(activity.action, activity.resourceType)}
                </p>
                <p className="text-xs text-gray-500">
                  {activity.userName || "System"} • {formatTimeAgo(activity.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
