import { NextResponse } from "next/server";

export function apiOk(data: any, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: { message } }, { status });
}
