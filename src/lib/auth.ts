import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";

export const hasAppSecret = (request: NextRequest): boolean => {
  const secret = request.headers.get("x-app-secret");

  return secret === serverEnv.appSecretPath;
};

export const hasJobsSecret = (request: NextRequest): boolean => {
  if (!serverEnv.jobsSecret) {
    return false;
  }

  const headerSecret = request.headers.get("x-jobs-secret");
  const auth = request.headers.get("authorization");

  if (headerSecret && headerSecret === serverEnv.jobsSecret) {
    return true;
  }

  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7) === serverEnv.jobsSecret;
  }

  return false;
};
