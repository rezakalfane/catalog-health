import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth-helpers";
import { refreshAnalysisProduct } from "@/lib/product-analysis-refresh";

export async function POST(_request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, productId } = await params;
  try {
    const result = await refreshAnalysisProduct({
      userId: user.id,
      analysisId: id,
      productId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Could not refresh this product analysis." },
      { status: error.status || 500 }
    );
  }
}
