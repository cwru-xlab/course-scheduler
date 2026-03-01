// API configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export const API_ENDPOINTS = {
  IMPORT_EXCEL: `${API_BASE_URL}/import-excel`,
  SOLVE: `${API_BASE_URL}/solve`,
  ROOT: `${API_BASE_URL}/`,
};

// File upload configuration
export const FILE_UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ACCEPTED_TYPES: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12'
  ],
  ACCEPTED_EXTENSIONS: ['.xlsx', '.xls', '.xlsm'],
};