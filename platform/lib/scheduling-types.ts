// Types matching the Flask/SQLAlchemy models
export interface Section {
  id: string;
  course_id: string;
  section_code: string;
  instructor_id: string;
  expected_enrollment: number;
  enrollment_cap: number;
  allowed_meeting_patterns: string[];
  room_requirements: string[];
  crosslist_group_id?: string;
  tags: string[];
  section_type?: string;
  is_crosslisted?: boolean;
  last_year_time?: string;
  last_year_room?: string;
}

export interface Instructor {
  id: string;
  name: string;
  rank_type: string;
  preferences?: {
    preferred_times: string[];
    preferred_days: string[];
    preferred_patterns: string[];
    unavailable_times: string[];
    max_teaching_days?: number;
  };
}

export interface Room {
  id: string;
  building: string;
  room_number: string;
  capacity: number;
  room_type: string;
  has_av: boolean;
  is_accessible: boolean;
  features: string[];
}

export interface Timeslot {
  id: string;
  days: string;
  start_time: string;
  end_time: string;
  slot_type: string;
}

export interface MeetingPattern {
  id: string;
  slots_required: number;
  allowed_days: string[];
  compatible_timeslot_sets: string[][];
}

export interface CrossListGroup {
  id: string;
  member_section_ids: string[];
  require_same_room: boolean;
}

export interface NoOverlapGroup {
  id: string;
  member_section_ids: string[];
  reason: string;
}

export interface BlockedTime {
  scope: string;
  timeslot_ids: string[];
  reason: string;
}

export interface LockedAssignment {
  section_id: string;
  fixed_timeslot_set?: string[];
  fixed_room?: string;
}

export interface SoftLock {
  section_id: string;
  preferred_timeslot_set?: string[];
  preferred_room?: string;
  weight: number;
}

export interface SchedulingInput {
  sections: Section[];
  instructors: Instructor[];
  rooms: Room[];
  timeslots: Timeslot[];
  meeting_patterns: MeetingPattern[];
  crosslist_groups: CrossListGroup[];
  no_overlap_groups: NoOverlapGroup[];
  blocked_times: BlockedTime[];
  locked_assignments: LockedAssignment[];
  soft_locks: SoftLock[];
}

export interface ImportResponse {
  status: string;
  raw_records?: {
    sections: Section[];
    instructors: Instructor[];
    rooms: Room[];
    timeslots: Timeslot[];
    meeting_patterns: MeetingPattern[];
  };
  scheduling_input?: SchedulingInput;
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

// Helper function to validate Excel data structure
export function validateExcelData(data: any): boolean {
  // Add validation logic based on expected Excel structure
  // This is a placeholder - implement based on your Excel format
  return true;
}

// Helper to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}