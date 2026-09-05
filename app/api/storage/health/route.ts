import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { checkStorage } from "@/services/storage";

export async function GET() { const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Authentification requise" }, { status: 401 }); return NextResponse.json(await checkStorage()); }