export const UNSAVED_CHANGES_CONFIRM_MESSAGE =
  "You have unsaved changes. Leave without saving?";

export const LOGOUT_UNSAVED_CONFIRM_MESSAGE =
  "You have unsaved changes. Sign out without saving?";

export function confirmLeaveIfUnsaved(hasUnsavedChanges: boolean): boolean {
  if (!hasUnsavedChanges) return true;
  return window.confirm(UNSAVED_CHANGES_CONFIRM_MESSAGE);
}
