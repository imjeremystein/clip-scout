import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const session = await auth();

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exportJob = await prisma.exportJob.findFirst({
    where: {
      id: jobId,
      orgId: session.user.organizationId,
    },
  });

  if (!exportJob) {
    return NextResponse.json({ error: "Export not found" }, { status: 404 });
  }

  if (exportJob.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Export not ready", status: exportJob.status },
      { status: 400 }
    );
  }

  if (!exportJob.fileData || !exportJob.fileName) {
    return NextResponse.json(
      { error: "Export file not available" },
      { status: 500 }
    );
  }

  // Decode base64 file data
  const fileBuffer = Buffer.from(exportJob.fileData, "base64");
  
  // Determine content type
  const contentType = exportJob.format === "JSON" 
    ? "application/json" 
    : "text/csv";

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${exportJob.fileName}"`,
      "Content-Length": fileBuffer.length.toString(),
    },
  });
}
