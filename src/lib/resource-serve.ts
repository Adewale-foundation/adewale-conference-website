import { NextResponse } from "next/server";
import { createClient } from "@/supabase/server";
import { createAdminClient } from "@/supabase/admin";
import { getSessionUser, getUserRole } from "@/supabase/auth";
import { canAccess, tierRank } from "@/lib/resource-access";

export type ServeResource = {
  id: string;
  access: string | null;
  storage_key: string | null;
  file_name: string | null;
  content_type: string | null;
  external_url: string | null;
  published: boolean;
  downloadable: boolean;
};

type Authorized = {
  resource: ServeResource;
  user: Awaited<ReturnType<typeof getSessionUser>>;
};

// Shared tier gate for the resource download + preview routes.
//   • Public-tier resources are free (served to anyone, no login) — read via the
//     service role so anonymous visitors (who can't pass RLS) still get them.
//   • Gated resources require a signed-in viewer whose school reached the tier
//     (admins bypass). Locked → 403.
// Returns a NextResponse to send back on any failure, else the resource + user.
export async function authorizeResource(
  id: string,
  request: Request,
): Promise<{ response: NextResponse } | Authorized> {
  const admin = createAdminClient();
  if (!admin) {
    return { response: NextResponse.json({ error: "Storage unavailable" }, { status: 503 }) };
  }

  const { data } = await admin
    .from("resources")
    .select(
      "id, access, storage_key, file_name, content_type, external_url, published, downloadable",
    )
    .eq("id", id)
    .maybeSingle();
  const resource = data as ServeResource | null;
  if (!resource || !resource.published) {
    return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  const isPublic = (resource.access ?? "public") === "public";
  const user = await getSessionUser();

  if (!isPublic) {
    if (!user) {
      return {
        response: NextResponse.redirect(
          new URL(`/portal/login?redirectTo=/portal`, request.url),
        ),
      };
    }
    // Admins bypass the tier gate; everyone else must have reached the tier.
    if ((await getUserRole()) !== "admin") {
      const supabase = await createClient();
      const { data: school } = await supabase.rpc("get_my_school");
      const reg =
        (school as {
          registration?: {
            status?: string;
            stage_results?: { stage: string; outcome: string | null }[];
          } | null;
        } | null)?.registration ?? null;
      // Tier is derived from stage advancement, not the status flag.
      const tier = tierRank(reg?.status ?? null, reg?.stage_results);
      let campAttending = false;
      if (resource.access === "camp") {
        const { data: attending, error } = await supabase.rpc("my_camp_attending");
        if (error) {
          return { response: NextResponse.json({ error: "Could not check camp access" }, { status: 500 }) };
        }
        campAttending = attending === true;
      }
      if (!canAccess(resource.access as string, tier, campAttending)) {
        return { response: NextResponse.json({ error: "Locked" }, { status: 403 }) };
      }
    }
  }

  return { resource, user };
}
