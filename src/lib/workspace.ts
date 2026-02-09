import { notFound } from "next/navigation";
import { serverEnv } from "@/lib/env.server";

export const assertWorkspaceAccess = (workspace: string): void => {
  if (workspace !== serverEnv.appSecretPath) {
    notFound();
  }
};
