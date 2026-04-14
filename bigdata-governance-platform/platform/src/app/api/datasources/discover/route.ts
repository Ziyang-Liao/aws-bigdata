export const dynamic = "force-dynamic";
import { discoverRdsInstances } from "@/lib/aws/datasource-service";
import { apiOk, apiError } from "@/lib/api-response";

export async function GET() {
  try {
    const instances = await discoverRdsInstances();
    return apiOk(instances);
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}
