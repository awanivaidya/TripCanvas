// POST /api/trips/interpret: what does this free-typed message in the new-trip chat mean? An answer
// to the current question, a change to an earlier answer ("I want to see cherry blossoms" changes
// the dates), or a question to answer. See agent/interpret.ts.
import { NextResponse } from "next/server";
import { describeAiFailure } from "@/lib/agent/llm";
import { auth } from "@/auth";
import { InterpretInputSchema } from "@/lib/schemas";
import { interpretMessage } from "@/lib/agent/interpret";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const parsed = InterpretInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    return NextResponse.json(await interpretMessage(parsed.data));
  } catch (error) {
    console.error("interpretMessage failed:", error);
    return NextResponse.json({ error: describeAiFailure(error, "I couldn't understand that. Try saying it another way.") }, { status: 502 });
  }
}
