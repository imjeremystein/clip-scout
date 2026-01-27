// Sport options
export const SPORTS = [
  { value: "NFL", label: "NFL Football" },
  { value: "NBA", label: "NBA Basketball" },
  { value: "MLB", label: "MLB Baseball" },
  { value: "NHL", label: "NHL Hockey" },
  { value: "SOCCER", label: "Soccer" },
  { value: "BOXING", label: "Boxing" },
  { value: "SPORTS_BETTING", label: "Sports Betting" },
] as const;

// Schedule type options
export const SCHEDULE_TYPES = [
  { value: "MANUAL", label: "Manual only" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKDAYS", label: "Weekdays (Mon-Fri)" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "CUSTOM", label: "Custom cron" },
] as const;

// Sport value type
export type SportValue = (typeof SPORTS)[number]["value"];

// Schedule type value
export type ScheduleTypeValue = (typeof SCHEDULE_TYPES)[number]["value"];
