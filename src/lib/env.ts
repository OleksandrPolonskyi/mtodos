const defaultSecretPath = "moddyland-canvas-7f3k2p";

export const publicEnv = {
  appSecretPath:
    process.env.NEXT_PUBLIC_APP_SECRET_PATH ??
    process.env.APP_SECRET_PATH ??
    defaultSecretPath,
  appTimezone: process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "Europe/Kyiv"
};
