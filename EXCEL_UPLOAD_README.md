# Course Scheduler - Excel Upload Setup

## Prerequisites

- Python 3.12+
- Node.js 18+
- pip or uv (for Python dependencies)
- npm or yarn (for Node dependencies)

## Backend Setup (Flask)

1. Navigate to the solver directory:
   ```bash
   cd solver
   ```

2. Install Python dependencies:
   ```bash
   # Using pip
   pip install -r requirements.txt
   
   # Or using uv
   uv pip install -r requirements.txt
   ```

   Or if using pyproject.toml:
   ```bash
   # Using pip
   pip install -e .
   
   # Or using uv
   uv pip install -e .
   ```

3. Install flask-cors (if not already installed):
   ```bash
   pip install flask-cors
   ```

4. Run the Flask backend:
   ```bash
   python app.py
   ```

   The backend will start on http://localhost:5000

## Frontend Setup (Next.js)

1. Navigate to the platform directory:
   ```bash
   cd platform
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

   The frontend will start on http://localhost:3000

## Using the Excel Upload Feature

1. Make sure both backend (port 5000) and frontend (port 3000) are running
2. Open http://localhost:3000 in your browser
3. Click the "Import Course File" button
4. Select or drag-and-drop an Excel file (.xlsx, .xls, or .xlsm)
5. Click "Upload & Parse"

The Excel file will be:
- Uploaded to the Flask backend
- Parsed using the excel_importer.py module
- Converted to JSON format matching the scheduling input structure
- Returned to the frontend for use with the solver

## Excel File Format

The Excel file should contain sheets with the following data:
- Sections: Course sections with enrollment, instructor assignments
- Instructors: Instructor information and preferences
- Rooms: Available rooms with capacity and features
- Timeslots: Available time periods
- Meeting Patterns: Scheduling patterns (MWF, TR, etc.)

## Troubleshooting

### CORS Error
If you see a CORS error, ensure:
1. flask-cors is installed: `pip install flask-cors`
2. The Flask app has CORS enabled (already configured in app.py)
3. Both servers are running on the correct ports

### Connection Error
If you see "Cannot connect to backend service":
1. Check that the Flask backend is running on port 5000
2. Check for any firewall or security software blocking the connection
3. Try accessing http://localhost:5000 directly in your browser

### File Upload Error
If the file upload fails:
1. Ensure the file is a valid Excel format (.xlsx, .xls, .xlsm)
2. Check that the file size is under 10MB
3. Verify the Excel file contains the expected sheet structure