'use client';

import { useState } from "react";
import { title, subtitle } from "@/components/primitives";
import { SchedulerDemo } from "@/components/scheduler/SchedulerDemo";
import { FileUploadModal } from "@/components/FileUploadModal";
import { Button } from "@heroui/button";
import { Upload } from "lucide-react";
import { ImportResponse } from "@/lib/scheduling-types";

export default function Page() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploadedData, setUploadedData] = useState<ImportResponse | null>(null);

  const handleUploadSuccess = (data: ImportResponse) => {
    console.log('Uploaded data:', data);
    setUploadedData(data);
    
    // You can now use the parsed data
    // The data will contain:
    // - raw_records: The raw parsed Excel data
    // - scheduling_input: The formatted data ready for the solver
    
    // Example: Pass to SchedulerDemo or store in state management
    if (data.scheduling_input) {
      // Handle the scheduling input data
      console.log('Scheduling input:', data.scheduling_input);
    }
  };

  return (
    <section className="flex flex-col gap-10 py-8 md:py-10">
      <div className="inline-block max-w-3xl">
        <span className={title()}>Weatherhead Course Scheduling</span>
        <div className={subtitle({ class: "mt-4" })}>
          Prototype decision-support UI backed by a server-side mock solver API.
        </div>
        
        <div className="mt-6">
          <Button 
            color="primary" 
            size="lg"
            startContent={<Upload className="w-5 h-5" />}
            onPress={() => setIsModalOpen(true)}
          >
            Import Course File
          </Button>
        </div>
        
        {uploadedData && (
          <div className="mt-4 p-4 bg-success-50 border border-success-200 rounded-lg">
            <p className="text-sm text-success-700">
              Successfully imported {uploadedData.raw_records?.sections?.length || 0} sections
            </p>
          </div>
        )}
      </div>

      <SchedulerDemo />
      
      <FileUploadModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />
    </section>
  );
}
