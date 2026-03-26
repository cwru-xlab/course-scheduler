from __future__ import annotations

from pathlib import Path

try:
    from spreadsheet_io.spreadsheet_utils import build_template_workbook
except ModuleNotFoundError:
    from spreadsheet_utils import build_template_workbook


def main() -> None:
    out_dir = Path(__file__).resolve().parent
    out_path = out_dir / "scheduling_template.xlsx"
    workbook = build_template_workbook()
    workbook.save(out_path)
    print(f"Wrote template workbook: {out_path}")


if __name__ == "__main__":
    main()
