export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { CognitoIdentityProviderClient, ListUsersCommand, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminDisableUserCommand, AdminEnableUserCommand, AdminAddUserToGroupCommand, AdminRemoveUserFromGroupCommand, AdminListGroupsForUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { apiOk, apiError } from "@/lib/api-response";

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "us-east-1" });
const POOL_ID = process.env.COGNITO_USER_POOL_ID || process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "";

export async function GET() {
  if (!POOL_ID) return apiOk([]);
  try {
    const { Users = [] } = await cognito.send(new ListUsersCommand({ UserPoolId: POOL_ID }));
    const users = [];
    for (const u of Users) {
      let groups: string[] = [];
      try {
        const { Groups = [] } = await cognito.send(new AdminListGroupsForUserCommand({ UserPoolId: POOL_ID, Username: u.Username! }));
        groups = Groups.map((g) => g.GroupName!);
      } catch {}
      const email = u.Attributes?.find((a) => a.Name === "email")?.Value || "";
      users.push({
        username: u.Username, email, status: u.UserStatus, enabled: u.Enabled,
        groups, createdAt: u.UserCreateDate?.toISOString(),
        role: groups.includes("bgp-admin") ? "Admin" : groups.includes("bgp-developer") ? "Developer" : "Viewer",
      });
    }
    return apiOk(users);
  } catch (e: any) {
    return apiOk([]);
  }
}

export async function POST(req: NextRequest) {
  if (!POOL_ID) return apiError("Cognito 未配置");
  const { username, email, password, role } = await req.json();
  if (!username || !password) return apiError("缺少 username 或 password");

  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: POOL_ID, Username: username, MessageAction: "SUPPRESS",
      TemporaryPassword: password,
      UserAttributes: email ? [{ Name: "email", Value: email }] : [],
    }));
    await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: POOL_ID, Username: username, Password: password, Permanent: true }));

    // Ensure groups exist and assign
    const groupName = role === "Admin" ? "bgp-admin" : role === "Developer" ? "bgp-developer" : "bgp-viewer";
    try {
      const { CreateGroupCommand } = await import("@aws-sdk/client-cognito-identity-provider");
      await cognito.send(new (CreateGroupCommand as any)({ UserPoolId: POOL_ID, GroupName: groupName }));
    } catch {}
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: POOL_ID, Username: username, GroupName: groupName }));

    return apiOk({ username, role });
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

export async function PUT(req: NextRequest) {
  if (!POOL_ID) return apiError("Cognito 未配置");
  const { username, action, role } = await req.json();

  try {
    if (action === "disable") await cognito.send(new AdminDisableUserCommand({ UserPoolId: POOL_ID, Username: username }));
    if (action === "enable") await cognito.send(new AdminEnableUserCommand({ UserPoolId: POOL_ID, Username: username }));
    if (action === "changeRole" && role) {
      for (const g of ["bgp-admin", "bgp-developer", "bgp-viewer"]) {
        try { await cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: POOL_ID, Username: username, GroupName: g })); } catch {}
      }
      const groupName = role === "Admin" ? "bgp-admin" : role === "Developer" ? "bgp-developer" : "bgp-viewer";
      try {
        const { CreateGroupCommand } = await import("@aws-sdk/client-cognito-identity-provider");
        await cognito.send(new (CreateGroupCommand as any)({ UserPoolId: POOL_ID, GroupName: groupName }));
      } catch {}
      await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: POOL_ID, Username: username, GroupName: groupName }));
    }
    return apiOk({ success: true });
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}
