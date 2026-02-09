import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";

export default function Page(): never {
  redirect(`/${serverEnv.appSecretPath}`);
}
