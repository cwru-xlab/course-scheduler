"""
Inspect xlsx files in input/ to discover sheet names and column headers.
Run from convert-spreadsheet directory: python inspect_sheets.py
"""
from pathlib import Path

import openpyxl

INPUT_DIR = Path(__file__).resolve().parent / "input"


def main() -> None:
    if not INPUT_DIR.exists():
        print(f"Input directory not found: {INPUT_DIR}")
        return
    xlsx_files = list(INPUT_DIR.glob("*.xlsx"))
    if not xlsx_files:
        print(f"No .xlsx files in {INPUT_DIR}")
        return
    for path in sorted(xlsx_files):
        print(f"\n{'='*60}\nFile: {path.name}\n{'='*60}")
        try:
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        except Exception as e:
            print(f"  Error loading workbook: {e}")
            continue
        for sheet_name in wb.sheetnames:
            sheet = wb[sheet_name]
            print(f"\n  Sheet: {sheet_name!r}")
            # First 3 rows to see header + sample data
            for row_idx, row in enumerate(sheet.iter_rows(max_row=4, values_only=True), start=1):
                cells = [str(c)[:40] if c is not None else "" for c in row]
                print(f"    Row {row_idx}: {cells}")
            # If sheet has many columns, show column count
            try:
                first_row = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True))
                print(f"    (columns: {len([c for c in first_row if c is not None])})")
            except StopIteration:
                pass
        wb.close()


if __name__ == "__main__":
    main()
