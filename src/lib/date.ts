import { addDays, parseISO } from "date-fns";

export const formatDateInTimeZone = (
  date: Date,
  timeZone: string,
  withTime = false
): string => {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }
      : {})
  });

  const formatted = formatter.format(date);

  if (!withTime) {
    return formatted;
  }

  return formatted.replace(" ", "T");
};

export const todayInTimeZone = (timeZone: string): string => {
  return formatDateInTimeZone(new Date(), timeZone);
};

export const isDateOverdue = (dateValue: string | null, timeZone: string): boolean => {
  if (!dateValue) {
    return false;
  }

  return dateValue < todayInTimeZone(timeZone);
};

export const isDueWithin24Hours = (
  dateValue: string | null,
  timeZone: string
): boolean => {
  if (!dateValue) {
    return false;
  }

  const today = todayInTimeZone(timeZone);
  const tomorrow = formatDateInTimeZone(addDays(new Date(), 1), timeZone);

  return dateValue === today || dateValue === tomorrow;
};

export const startAndEndOfWeek = (
  timeZone: string
): {
  weekStart: string;
  weekEnd: string;
} => {
  const now = new Date();
  const localeDate = formatDateInTimeZone(now, timeZone);
  const baseDate = parseISO(`${localeDate}T00:00:00.000Z`);
  const day = baseDate.getUTCDay();
  const shiftToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = addDays(baseDate, shiftToMonday);
  const weekEnd = addDays(weekStart, 6);

  return {
    weekStart: formatDateInTimeZone(weekStart, "UTC"),
    weekEnd: formatDateInTimeZone(weekEnd, "UTC")
  };
};
