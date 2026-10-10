import { TIME } from './config';
export const SCHEDULES = {
  ticksPerDay:
    TIME.dayNightSecondsAtNormalSpeed /
    (TIME.secondsPerDay[1] / TIME.ticksPerDay),
  hoursPerDay: 24,
  shiftStartHours: [6, 14, 22],
  departureSpreadHours: 3,
  shiftDurationHours: 10,
  minimumStayHours: 1,
  sleepHours: 8,
  sleepStartEndHours: [22, 6],
  movementSpeedScale: 4,
  shoppingStayHours: 0.5,
  leisureStayHours: 1,
  retryTicks: 20,
  optionalSearchRadiusM: 1000,
} as const;
