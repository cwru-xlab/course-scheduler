'use client';

import React, { useState, useRef } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Progress } from "@heroui/progress";
import { Upload, FileSpreadsheet, X } from 'lucide-react';
import { ImportResponse } from '@/lib/scheduling-types';
import { API_ENDPOINTS, FILE_UPLOAD_CONFIG } from '@/lib/api-config';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: (data: ImportResponse) => void;
}

export function FileUploadModal({ isOpen, onClose, onUploadSuccess }: FileUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setError(null);
    
    if (selectedFile) {
      // Check file size
      if (selectedFile.size > FILE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
        setError(`File size must be less than ${FILE_UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`);
        setFile(null);
        return;
      }
      
      // Validate file type
      const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
      
      if (!FILE_UPLOAD_CONFIG.ACCEPTED_TYPES.includes(selectedFile.type) && 
          !['xlsx', 'xls', 'xlsm'].includes(fileExtension || '')) {
        setError('Please select a valid Excel file (.xlsx, .xls, or .xlsm)');
        setFile(null);
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    // First check if backend is available
    try {
      const healthCheck = await fetch(API_ENDPOINTS.ROOT);
      if (!healthCheck.ok && healthCheck.status !== 200) {
        throw new Error('Backend service is not available');
      }
    } catch (err) {
      setError('Cannot connect to backend service. Please ensure it is running on http://localhost:5001');
      setIsUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Replace with your actual API endpoint
      const response = await fetch(API_ENDPOINTS.IMPORT_EXCEL, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errors?.[0]?.message || 'Upload failed');
      }

      const data = await response.json();
      
      // Call success callback with parsed data
      if (onUploadSuccess) {
        onUploadSuccess(data);
      }

      // Reset and close modal
      setTimeout(() => {
        setFile(null);
        setUploadProgress(0);
        onClose();
      }, 500);

    } catch (err) {
      console.error('Upload error:', err);
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        setError('Unable to connect to the server. Please ensure the backend is running on http://localhost:5001');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to upload file');
      }
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) {
      const mockEvent = {
        target: { files: [droppedFile] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(mockEvent);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const resetModal = () => {
    setFile(null);
    setError(null);
    setUploadProgress(0);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={() => {
        resetModal();
        onClose();
      }}
      size="lg"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                Import Course Schedule
              </div>
              <p className="text-sm font-normal text-default-500">
                Upload an Excel file containing course scheduling data
              </p>
            </ModalHeader>
            <ModalBody>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  file ? 'border-success bg-success-50/10' : 'border-default-300 hover:border-primary'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.xlsm"
                  onChange={handleFileChange}
                  className="hidden"
                  id="excel-file-input"
                />
                
                {!file ? (
                  <label htmlFor="excel-file-input" className="cursor-pointer">
                    <Upload className="w-12 h-12 mx-auto mb-4 text-default-400" />
                    <p className="text-lg font-medium mb-2">
                      Drop your Excel file here or click to browse
                    </p>
                    <p className="text-sm text-default-500">
                      Supported formats: .xlsx, .xls, .xlsm
                    </p>
                  </label>
                ) : (
                  <div className="flex flex-col items-center">
                    <FileSpreadsheet className="w-12 h-12 mb-4 text-success" />
                    <p className="text-lg font-medium mb-2">{file.name}</p>
                    <p className="text-sm text-default-500 mb-4">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button
                      size="sm"
                      variant="flat"
                      color="danger"
                      startContent={<X className="w-4 h-4" />}
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                    >
                      Remove file
                    </Button>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-danger-50 border border-danger-200 rounded-lg">
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              {isUploading && (
                <div className="mt-4">
                  <Progress 
                    value={uploadProgress} 
                    color="primary"
                    className="mb-2"
                    aria-label="Upload progress"
                  />
                  <p className="text-sm text-default-500 text-center">
                    Uploading and parsing file... {uploadProgress}%
                  </p>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button 
                color="danger" 
                variant="light" 
                onPress={() => {
                  resetModal();
                  onClose();
                }}
                isDisabled={isUploading}
              >
                Cancel
              </Button>
              <Button 
                color="primary" 
                onPress={handleUpload}
                isDisabled={!file || isUploading}
                isLoading={isUploading}
              >
                Upload & Parse
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}