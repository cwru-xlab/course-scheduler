import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  try {
    const { notebookId } = await params;

    // For now, handle the "sample" notebook from local filesystem
    // TODO: In the future, fetch from AWS S3 based on notebookId
    if (notebookId === "sample") {
      const filePath = path.join(process.cwd(), "public", "sample.ipynb");
      const fileContent = await fs.readFile(filePath, "utf-8");
      const notebookData = JSON.parse(fileContent);
      
      return NextResponse.json(notebookData);
    }

    // TODO: For non-sample notebooks, fetch from AWS S3
    // Example structure for future S3 implementation:
    // const s3Client = new S3Client({ region: process.env.AWS_REGION });
    // const command = new GetObjectCommand({
    //   Bucket: process.env.S3_BUCKET_NAME,
    //   Key: `notebooks/${notebookId}.ipynb`,
    // });
    // const response = await s3Client.send(command);
    // const notebookContent = await response.Body?.transformToString();
    // return NextResponse.json(JSON.parse(notebookContent));

    return NextResponse.json(
      { error: "Notebook not found. S3 integration pending." },
      { status: 404 }
    );
  } catch (error) {
    console.error("Error fetching notebook:", error);
    return NextResponse.json(
      { error: "Failed to load notebook" },
      { status: 500 }
    );
  }
}

