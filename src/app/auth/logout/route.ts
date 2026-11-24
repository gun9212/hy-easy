import { errorResponse } from "@/lib/auth";
import { performLogout } from "@/lib/auth-cookies";

export async function POST(request: Request) {
  try {
    return await performLogout(request);
  } catch (e) {
    return errorResponse(e);
  }
}
