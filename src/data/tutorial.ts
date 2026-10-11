/** GDD §18. Reward is granted once by the Worker, never by the UI. */
export const TUTORIAL = { reward: 5000, roads: 3, steps: 8 } as const;
export const CAMERA_LESSONS = ['pan', 'rotate', 'zoom'] as const;
export type CameraLesson = (typeof CAMERA_LESSONS)[number];
export type TutorialAction = CameraLesson | 'finance' | 'skip' | 'dismiss';
